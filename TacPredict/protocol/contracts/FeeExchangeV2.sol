// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
import {ConditionalPositions} from "./ConditionalPositions.sol";

/// @notice REVIEW ONLY. Undeployed CLOB add-on. Never replaces or upgrades the six V1 contracts.
/// @dev A fixed 1% buyer surcharge is escrowed here until the immutable Registry result.
///      VOID fees are paid to the original payer, NOT the current share holder.
///      No collateral, principal-refund, arbitrary sweep or administrator transfer authority.
contract FeeExchangeV2 is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant PRICE_SCALE = 1_000_000;
    uint16 public constant FEE_BPS = 100;
    uint256 private constant BPS_SCALE = 10_000;
    bytes32 public constant ORDER_TYPEHASH = keccak256("Order(uint256 marketId,uint8 outcome,address maker,bool isBuy,uint256 price,uint256 shares,uint256 nonce,uint64 expiration,address taker,uint16 feeBps,address feeRecipient,uint256 maxTotalCost)");
    struct Order {
        uint256 marketId;
        uint8 outcome;
        address maker;
        bool isBuy;
        uint256 price;
        uint256 shares;
        uint256 nonce;
        uint64 expiration;
        address taker;
        uint16 feeBps;
        address feeRecipient;
        uint256 maxTotalCost;
    }
    MarketRegistry public immutable registry;
    ConditionalPositions public immutable positions;
    IERC20 public immutable usdc;
    address public immutable treasury;
    mapping(bytes32 => uint256) public filledShares;
    mapping(bytes32 => bool) public cancelled;
    mapping(address => uint256) public minimumNonce;
    // Fee scopes: buy digest across fill+match; sell digest + caller for direct sell fills.
    mapping(bytes32 => uint256) public feeScopeNotional;
    mapping(bytes32 => uint256) public buyerTotalDebited;
    mapping(bytes32 => uint256) public buyExecutedNotional;
    mapping(uint256 => mapping(address => uint256)) public feesPaid;
    mapping(uint256 => mapping(address => uint256)) public feesRefunded;
    mapping(uint256 => uint256) public marketFeeEscrow;
    mapping(uint256 => bool) public marketFeesReleased;
    uint256 public totalFeeEscrow;
    uint256 public totalFeesCollected;
    uint256 public totalFeesRefunded;
    uint256 public totalFeesReleased;

    event OrderFilled(bytes32 indexed orderId, uint256 indexed marketId, address indexed maker, uint256 shares, uint256 totalFilled);
    event OrderCancelled(bytes32 indexed orderId, address indexed maker);
    event NonceInvalidated(address indexed maker, uint256 nonce);
    event TradeExecuted(bytes32 indexed buyOrderId, bytes32 indexed sellOrderId, uint256 indexed marketId, address buyer, address seller, uint8 outcome, uint256 price, uint256 shares, uint256 usdcAmount);
    event ExecutionFeeEscrowed(bytes32 indexed feeScope, uint256 indexed marketId, address indexed buyer, uint256 notionalAtomic, uint256 feeAtomic, uint16 feeBps, address treasury);
    event ExecutionFeeRefunded(uint256 indexed marketId, address indexed buyer, uint256 amountAtomic);
    event MarketFeesReleased(uint256 indexed marketId, address indexed treasury, uint256 amountAtomic);

    constructor(MarketRegistry r, ConditionalPositions p, address treasury_) EIP712("TacPredictFeeExchange", "2") {
        require(address(r).code.length > 0 && address(p.registry()) == address(r), "Registry mismatch");
        require(treasury_ != address(0) && treasury_ != address(this), "Invalid treasury");
        registry = r; positions = p; usdc = IERC20(r.collateralToken()); treasury = treasury_;
    }

    function orderId(Order calldata o) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(ORDER_TYPEHASH, o.marketId, o.outcome, o.maker, o.isBuy, o.price, o.shares, o.nonce, o.expiration, o.taker, o.feeBps, o.feeRecipient, o.maxTotalCost)));
    }
    function _consume(Order calldata o, bytes calldata signature, uint256 quantity, address taker) private returns (bytes32 digest, uint256 beforeFilled) {
        MarketRegistry.Market memory m = registry.getMarket(o.marketId);
        require(registry.isTradingOpen(o.marketId) && o.outcome < m.outcomeCount, "Market closed");
        require(o.maker != address(0) && o.maker != taker && (o.taker == address(0) || o.taker == taker), "Invalid counterparty");
        require(o.price > 0 && o.price < PRICE_SCALE && o.shares > 0 && quantity > 0 && block.timestamp < o.expiration && o.expiration <= m.closeAt && o.nonce >= minimumNonce[o.maker], "Invalid order");
        require(o.feeBps == FEE_BPS && o.feeRecipient == treasury && (o.isBuy ? o.maxTotalCost > 0 : o.maxTotalCost == 0), "Invalid fee consent");
        digest = orderId(o); beforeFilled = filledShares[digest];
        require(!cancelled[digest] && quantity <= o.shares - beforeFilled && SignatureChecker.isValidSignatureNow(o.maker, digest, signature), "Invalid signature/fill");
        filledShares[digest] = beforeFilled + quantity;
        emit OrderFilled(digest, o.marketId, o.maker, quantity, beforeFilled + quantity);
    }
    /// @notice Returns the exact surcharge for a scope at current state, never floating point.
    function feeFor(bytes32 scope, uint256 cost) public view returns (uint256) {
        uint256 beforeNotional = feeScopeNotional[scope];
        return Math.mulDiv(beforeNotional + cost, FEE_BPS, BPS_SCALE) - Math.mulDiv(beforeNotional, FEE_BPS, BPS_SCALE);
    }
    function directFeeScope(bytes32 sellOrderId, address buyer) public pure returns (bytes32) {
        return keccak256(abi.encode("DIRECT_SELL_FILL", sellOrderId, buyer));
    }
    function _settle(uint256 marketId, uint8 outcome, address buyer, address seller, uint256 quantity, uint256 cost, bytes32 scope) private returns (uint256 fee) {
        require(cost > 0, "Fill too small");
        fee = feeFor(scope, cost);
        feeScopeNotional[scope] += cost;
        feesPaid[marketId][buyer] += fee;
        marketFeeEscrow[marketId] += fee;
        totalFeeEscrow += fee;
        totalFeesCollected += fee;
        // All fee/notional/share transfers and counters revert if ANY leg fails.
        usdc.safeTransferFrom(buyer, seller, cost);
        if (fee > 0) {
            uint256 beforeBalance = usdc.balanceOf(address(this));
            usdc.safeTransferFrom(buyer, address(this), fee);
            require(usdc.balanceOf(address(this)) - beforeBalance == fee, "Unsupported collateral");
        }
        positions.safeTransferFrom(seller, buyer, positions.tokenId(marketId, outcome), quantity, "");
        emit ExecutionFeeEscrowed(scope, marketId, buyer, cost, fee, FEE_BPS, treasury);
    }
    /// @param maxBuyerDebit Explicit taker cap for this call, including fee. A buy maker also signs a cumulative cap.
    function fillOrder(Order calldata o, bytes calldata signature, uint256 quantity, uint256 maxBuyerDebit) external nonReentrant {
        (bytes32 digest, uint256 beforeFilled) = _consume(o, signature, quantity, msg.sender);
        uint256 cost = Math.mulDiv(beforeFilled + quantity, o.price, PRICE_SCALE) - Math.mulDiv(beforeFilled, o.price, PRICE_SCALE);
        address buyer = o.isBuy ? o.maker : msg.sender;
        address seller = o.isBuy ? msg.sender : o.maker;
        bytes32 scope = o.isBuy ? digest : directFeeScope(digest, buyer);
        uint256 debit = cost + feeFor(scope, cost);
        require(debit <= maxBuyerDebit, "Taker debit limit");
        if (o.isBuy) {
            require(buyerTotalDebited[digest] + debit <= o.maxTotalCost, "Signed debit limit");
            buyerTotalDebited[digest] += debit;
            buyExecutedNotional[digest] += cost;
        }
        _settle(o.marketId, o.outcome, buyer, seller, quantity, cost, scope);
        emit TradeExecuted(o.isBuy ? digest : bytes32(0), o.isBuy ? bytes32(0) : digest, o.marketId, buyer, seller, o.outcome, o.price, quantity, cost);
    }
    function matchOrders(Order calldata buy, bytes calldata buySignature, Order calldata sell, bytes calldata sellSignature, uint256 quantity) external nonReentrant {
        require(buy.isBuy && !sell.isBuy && buy.marketId == sell.marketId && buy.outcome == sell.outcome && buy.price >= sell.price, "Orders do not cross");
        (bytes32 buyId, uint256 buyBefore) = _consume(buy, buySignature, quantity, sell.maker);
        (bytes32 sellId, uint256 sellBefore) = _consume(sell, sellSignature, quantity, buy.maker);
        uint256 cost = Math.mulDiv(sellBefore + quantity, sell.price, PRICE_SCALE) - Math.mulDiv(sellBefore, sell.price, PRICE_SCALE);
        // Actual lifetime notional may use earlier price improvement, never exceed the signed buyer price.
        require(buyExecutedNotional[buyId] + cost <= Math.mulDiv(buyBefore + quantity, buy.price, PRICE_SCALE), "Signed price limit");
        uint256 debit = cost + feeFor(buyId, cost);
        require(buyerTotalDebited[buyId] + debit <= buy.maxTotalCost, "Signed debit limit");
        buyerTotalDebited[buyId] += debit;
        buyExecutedNotional[buyId] += cost;
        _settle(buy.marketId, buy.outcome, buy.maker, sell.maker, quantity, cost, buyId);
        emit TradeExecuted(buyId, sellId, buy.marketId, buy.maker, sell.maker, buy.outcome, sell.price, quantity, cost);
    }
    function cancelOrder(Order calldata o) external {
        require(msg.sender == o.maker, "Not maker"); bytes32 digest = orderId(o); cancelled[digest] = true; emit OrderCancelled(digest, msg.sender);
    }
    function invalidateNonce(uint256 nonce) external {
        require(nonce > minimumNonce[msg.sender], "Nonce must increase"); minimumNonce[msg.sender] = nonce; emit NonceInvalidated(msg.sender, nonce);
    }
    function refundableFee(uint256 marketId, address buyer) public view returns (uint256) {
        if (registry.getMarket(marketId).status != MarketRegistry.Status.VOID) return 0;
        return feesPaid[marketId][buyer] - feesRefunded[marketId][buyer];
    }
    /// @notice Helper-triggered refunds can NEVER redirect a buyer's money. Principal is claimed separately in V1 Settlement.
    function refundExecutionFeeFor(uint256 marketId, address buyer) external nonReentrant returns (uint256 amount) {
        require(buyer != address(0), "Invalid buyer"); amount = refundableFee(marketId, buyer); require(amount > 0, "No fee refund");
        feesRefunded[marketId][buyer] += amount;
        marketFeeEscrow[marketId] -= amount;
        totalFeeEscrow -= amount;
        totalFeesRefunded += amount;
        usdc.safeTransfer(buyer, amount);
        emit ExecutionFeeRefunded(marketId, buyer, amount);
    }
    function releasableMarketFees(uint256 marketId) public view returns (uint256) {
        if (registry.getMarket(marketId).status != MarketRegistry.Status.RESOLVED || marketFeesReleased[marketId]) return 0;
        return marketFeeEscrow[marketId];
    }
    /// @notice Only final NON-VOID earned fees, always to immutable treasury. Not a collateral/surplus sweep.
    function releaseMarketFees(uint256 marketId) external nonReentrant returns (uint256 amount) {
        require(registry.getMarket(marketId).status == MarketRegistry.Status.RESOLVED && !marketFeesReleased[marketId], "Fees not releasable");
        amount = marketFeeEscrow[marketId]; require(amount > 0, "No earned fees");
        marketFeesReleased[marketId] = true;
        marketFeeEscrow[marketId] = 0;
        totalFeeEscrow -= amount;
        totalFeesReleased += amount;
        usdc.safeTransfer(treasury, amount);
        emit MarketFeesReleased(marketId, treasury, amount);
    }
}
