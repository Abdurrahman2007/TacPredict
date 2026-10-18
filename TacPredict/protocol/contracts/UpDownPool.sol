// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Parimutuel Up/Down rounds paid in native Base USDC. It is a separate contract: the
/// MarketRegistry, Exchange and the other order-book contracts are not touched by it.
///
/// A round is one asset, one duration and one UTC-aligned start time (start % duration == 0), so
/// rounds exist automatically and nobody has to create them one by one. Bets are accepted until the
/// round starts. After the start a reporter posts the first price reading taken at or after the
/// start (CoinGecko), and after the end the first reading at or after the end. End above start: Up
/// wins. End below start: Down wins.
///
/// Money rules, enforced here and not by any administrator:
///  - Winners get their own stake back plus their share of the losing side, minus the fee.
///  - The fee is taken only from the losing side and is fixed for a round when its first bet lands.
///  - A round with no bets on one side, an equal price, or missing price readings is refunded in full.
///  - A guardian can void a round, but only before payouts open, and a void only returns stakes.
///  - Nobody can edit a stake or move user funds. The owner can only withdraw `ownerBalance`: the
///    fees and the rounding dust that real rounds have produced.
contract UpDownPool is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    uint256 public constant MAX_FEE_BPS = 1000;
    /// @dev A price reading counts only when the provider timestamp falls this many seconds after the boundary.
    uint64 public constant OBSERVE_WINDOW = 180;
    /// @dev The reporter transaction must land within this many seconds of the boundary.
    uint64 public constant REPORT_GRACE = 300;
    /// @dev Payouts open this many seconds after the end price is posted; a guardian can void during this time.
    uint64 public constant REVIEW = 120;

    enum State { OPEN, SETTLED, VOID }
    enum Side { NONE, UP, DOWN }

    struct Window {
        uint128 upPool;
        uint128 downPool;
        uint128 startPrice;
        uint128 endPrice;
        uint128 fee;
        uint128 distributable;
        uint128 claimedWin;
        uint128 paidBonus;
        uint64 startObservedAt;
        uint64 endObservedAt;
        uint64 claimOpensAt;
        uint16 feeBps;
        State state;
        Side result;
        bool feeBooked;
    }
    struct Position { uint128 up; uint128 down; bool claimed; }
    struct Report { uint8 asset; uint32 duration; uint64 start; uint128 price; uint64 observedAt; }

    IERC20 public immutable collateralToken;
    address public treasury;
    uint256 public feeBps;
    uint256 public minBet;
    uint256 public maxPerUser;
    uint256 public maxPoolPerWindow;
    uint256 public ownerBalance;
    bool public bettingPaused;

    mapping(uint8 => mapping(uint32 => bool)) public seriesEnabled;
    mapping(bytes32 => Window) private windows;
    mapping(bytes32 => mapping(address => Position)) private positions;

    event SeriesSet(uint8 indexed asset, uint32 indexed duration, bool enabled);
    event Bet(bytes32 indexed key, address indexed user, uint8 asset, uint32 duration, uint64 start, bool up, uint256 amount);
    event StartReported(bytes32 indexed key, uint8 asset, uint32 duration, uint64 start, uint128 price, uint64 observedAt);
    event EndReported(bytes32 indexed key, uint8 asset, uint32 duration, uint64 start, uint128 price, uint64 observedAt, Side result);
    event WindowVoided(bytes32 indexed key, uint8 reason, bytes32 reasonHash);
    event Claimed(bytes32 indexed key, address indexed user, uint256 amount, bool refund);
    event OwnerWithdrawn(address indexed to, uint256 amount);
    event BettingPaused(bool paused);
    event FeeSet(uint256 feeBps);
    event LimitsSet(uint256 minBet, uint256 maxPerUser, uint256 maxPoolPerWindow);
    event TreasurySet(address indexed treasury);

    /// @dev Void reasons: 1 guardian, 2 price readings missing, 3 equal prices, 4 one side had no bets.
    constructor(address admin, address usdc, address treasury_, uint256 feeBps_) {
        require(block.chainid == 8453 || block.chainid == 84532, "Base only");
        address nativeUSDC = block.chainid == 8453 ? 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 : 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
        require(usdc == nativeUSDC, "Native Base USDC only");
        require(admin != address(0) && treasury_ != address(0) && usdc.code.length > 0, "Bad deployment");
        require(IERC20Metadata(usdc).decimals() == 6, "USDC decimals");
        require(feeBps_ <= MAX_FEE_BPS, "Fee too high");
        collateralToken = IERC20(usdc);
        treasury = treasury_;
        feeBps = feeBps_;
        minBet = 1_000_000;
        maxPerUser = 50_000_000;
        maxPoolPerWindow = 500_000_000;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
    }

    // ---------------------------------------------------------------- views

    function windowKey(uint8 asset, uint32 duration, uint64 start) public pure returns (bytes32) {
        return keccak256(abi.encode(asset, duration, start));
    }

    function getWindow(uint8 asset, uint32 duration, uint64 start) external view returns (Window memory) {
        return windows[windowKey(asset, duration, start)];
    }

    function getPosition(uint8 asset, uint32 duration, uint64 start, address user) external view returns (Position memory) {
        return positions[windowKey(asset, duration, start)][user];
    }

    /// @notice What `claim` would pay this user right now, and whether it is a plain refund.
    function previewClaim(uint8 asset, uint32 duration, uint64 start, address user) external view returns (uint256 amount, bool refund, bool ready) {
        bytes32 key = windowKey(asset, duration, start);
        Window storage w = windows[key];
        Position storage p = positions[key][user];
        if (p.claimed || (p.up == 0 && p.down == 0) || w.state == State.OPEN) return (0, false, false);
        if (w.state == State.VOID) return (uint256(p.up) + p.down, true, true);
        uint256 winners = w.result == Side.UP ? w.upPool : w.downPool;
        uint256 stake = w.result == Side.UP ? p.up : p.down;
        if (stake == 0) return (0, false, false);
        return (stake + (stake * w.distributable) / winners, false, block.timestamp >= w.claimOpensAt);
    }

    // ----------------------------------------------------------------- bets

    function bet(uint8 asset, uint32 duration, uint64 start, bool up, uint256 amount) external nonReentrant {
        require(!bettingPaused, "Betting paused");
        require(seriesEnabled[asset][duration], "Series is off");
        require(start % duration == 0, "Round is not aligned");
        require(block.timestamp < start, "Round already started");
        require(start <= block.timestamp + duration, "Round opens later");
        require(amount >= minBet, "Below minimum");
        bytes32 key = windowKey(asset, duration, start);
        Window storage w = windows[key];
        require(w.state == State.OPEN, "Round closed");
        Position storage p = positions[key][msg.sender];
        require(uint256(p.up) + p.down + amount <= maxPerUser, "Over personal limit");
        require(uint256(w.upPool) + w.downPool + amount <= maxPoolPerWindow, "Round is full");
        if (w.upPool == 0 && w.downPool == 0) w.feeBps = uint16(feeBps);
        if (up) {
            w.upPool += uint128(amount);
            p.up += uint128(amount);
        } else {
            w.downPool += uint128(amount);
            p.down += uint128(amount);
        }
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Bet(key, msg.sender, asset, duration, start, up, amount);
    }

    // -------------------------------------------------------------- reports

    function reportStarts(Report[] calldata items) external onlyRole(REPORTER_ROLE) {
        for (uint256 i; i < items.length; ++i) _reportStart(items[i]);
    }

    function reportEnds(Report[] calldata items) external onlyRole(REPORTER_ROLE) {
        for (uint256 i; i < items.length; ++i) _reportEnd(items[i]);
    }

    function _reportStart(Report calldata r) private {
        bytes32 key = windowKey(r.asset, r.duration, r.start);
        Window storage w = windows[key];
        require(w.state == State.OPEN && w.startPrice == 0, "Not reportable");
        require(uint256(w.upPool) + w.downPool > 0, "Empty round");
        require(r.price > 0, "Price required");
        require(block.timestamp >= r.start && block.timestamp <= uint256(r.start) + REPORT_GRACE, "Outside report time");
        require(r.observedAt >= r.start && r.observedAt <= uint256(r.start) + OBSERVE_WINDOW && r.observedAt <= block.timestamp, "Reading is not from the start");
        w.startPrice = r.price;
        w.startObservedAt = r.observedAt;
        emit StartReported(key, r.asset, r.duration, r.start, r.price, r.observedAt);
    }

    function _reportEnd(Report calldata r) private {
        bytes32 key = windowKey(r.asset, r.duration, r.start);
        Window storage w = windows[key];
        require(w.state == State.OPEN && w.startPrice != 0 && w.endPrice == 0, "Not reportable");
        require(r.price > 0, "Price required");
        uint256 end = uint256(r.start) + r.duration;
        require(block.timestamp >= end && block.timestamp <= end + REPORT_GRACE, "Outside report time");
        require(r.observedAt >= end && r.observedAt <= end + OBSERVE_WINDOW && r.observedAt <= block.timestamp, "Reading is not from the end");
        w.endPrice = r.price;
        w.endObservedAt = r.observedAt;
        uint128 upPool = w.upPool;
        uint128 downPool = w.downPool;
        if (upPool == 0 || downPool == 0) {
            _void(key, w, 4, bytes32(0));
        } else if (r.price == w.startPrice) {
            _void(key, w, 3, bytes32(0));
        } else {
            Side winner = r.price > w.startPrice ? Side.UP : Side.DOWN;
            uint128 loserPool = winner == Side.UP ? downPool : upPool;
            uint128 fee = uint128((uint256(loserPool) * w.feeBps) / 10_000);
            w.result = winner;
            w.state = State.SETTLED;
            w.fee = fee;
            w.distributable = loserPool - fee;
            w.claimOpensAt = uint64(block.timestamp + REVIEW);
        }
        emit EndReported(key, r.asset, r.duration, r.start, r.price, r.observedAt, w.result);
    }

    // -------------------------------------------------------- refund control

    /// @notice Anyone can refund a round whose price readings never arrived in time.
    function voidUnreported(uint8 asset, uint32 duration, uint64 start) external {
        bytes32 key = windowKey(asset, duration, start);
        Window storage w = windows[key];
        require(w.state == State.OPEN && uint256(w.upPool) + w.downPool > 0, "Nothing to refund");
        bool noStart = w.startPrice == 0 && block.timestamp > uint256(start) + REPORT_GRACE;
        bool noEnd = w.startPrice != 0 && block.timestamp > uint256(start) + duration + REPORT_GRACE;
        require(noStart || noEnd, "Readings can still arrive");
        _void(key, w, 2, bytes32(0));
    }

    /// @notice The guardian can refund a round before payouts open. Stakes only ever go back to their owners.
    function voidWindow(uint8 asset, uint32 duration, uint64 start, bytes32 reasonHash) external onlyRole(GUARDIAN_ROLE) {
        bytes32 key = windowKey(asset, duration, start);
        Window storage w = windows[key];
        require(uint256(w.upPool) + w.downPool > 0, "Empty round");
        require(w.state == State.OPEN || (w.state == State.SETTLED && block.timestamp < w.claimOpensAt), "Payouts already open");
        _void(key, w, 1, reasonHash);
    }

    function _void(bytes32 key, Window storage w, uint8 reason, bytes32 reasonHash) private {
        w.state = State.VOID;
        w.result = Side.NONE;
        w.fee = 0;
        w.distributable = 0;
        w.claimOpensAt = uint64(block.timestamp);
        emit WindowVoided(key, reason, reasonHash);
    }

    // --------------------------------------------------------------- payouts

    /// @notice Pays this user's winnings, or refunds the full stake if the round was voided.
    function claim(uint8 asset, uint32 duration, uint64 start) external nonReentrant returns (uint256 amount) {
        bytes32 key = windowKey(asset, duration, start);
        Window storage w = windows[key];
        Position storage p = positions[key][msg.sender];
        require(!p.claimed, "Already claimed");
        require(p.up > 0 || p.down > 0, "No position");
        require(w.state != State.OPEN, "Round not finished");
        bool refund = w.state == State.VOID;
        if (refund) {
            amount = uint256(p.up) + p.down;
        } else {
            require(block.timestamp >= w.claimOpensAt, "Payouts open soon");
            uint256 winners = w.result == Side.UP ? w.upPool : w.downPool;
            uint256 stake = w.result == Side.UP ? p.up : p.down;
            require(stake > 0, "No winning stake");
            uint256 bonus = (stake * w.distributable) / winners;
            amount = stake + bonus;
            w.claimedWin += uint128(stake);
            w.paidBonus += uint128(bonus);
            _bookFee(w);
            if (w.claimedWin == winners) ownerBalance += uint256(w.distributable) - w.paidBonus;
        }
        p.claimed = true;
        collateralToken.safeTransfer(msg.sender, amount);
        emit Claimed(key, msg.sender, amount, refund);
    }

    /// @notice Books the round fee for the owner once payouts are open, even if nobody has claimed yet.
    function finalizeWindow(uint8 asset, uint32 duration, uint64 start) external {
        Window storage w = windows[windowKey(asset, duration, start)];
        require(w.state == State.SETTLED && block.timestamp >= w.claimOpensAt, "Not final");
        _bookFee(w);
    }

    function _bookFee(Window storage w) private {
        if (w.feeBooked) return;
        w.feeBooked = true;
        ownerBalance += w.fee;
    }

    /// @notice Sends the owner's fees and rounding dust to the treasury. Anyone can call it; the money always goes to the treasury.
    function withdrawOwnerBalance() external nonReentrant returns (uint256 amount) {
        amount = ownerBalance;
        require(amount > 0, "Nothing to withdraw");
        ownerBalance = 0;
        collateralToken.safeTransfer(treasury, amount);
        emit OwnerWithdrawn(treasury, amount);
    }

    // ----------------------------------------------------------------- admin

    function setSeries(uint8 asset, uint32 duration, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(asset < 16, "Unknown asset");
        require(duration == 300 || duration == 900 || duration == 1800 || duration == 3600 || duration == 43200 || duration == 86400, "Unsupported duration");
        seriesEnabled[asset][duration] = enabled;
        emit SeriesSet(asset, duration, enabled);
    }

    /// @notice Changes the fee for rounds that have no bets yet. A round keeps the fee it had at its first bet.
    function setFee(uint256 newFeeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFeeBps <= MAX_FEE_BPS, "Fee too high");
        feeBps = newFeeBps;
        emit FeeSet(newFeeBps);
    }

    function setLimits(uint256 newMinBet, uint256 newMaxPerUser, uint256 newMaxPool) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newMinBet > 0 && newMinBet <= newMaxPerUser && newMaxPerUser <= newMaxPool && newMaxPool <= type(uint112).max, "Bad limits");
        minBet = newMinBet;
        maxPerUser = newMaxPerUser;
        maxPoolPerWindow = newMaxPool;
        emit LimitsSet(newMinBet, newMaxPerUser, newMaxPool);
    }

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTreasury != address(0), "Treasury required");
        treasury = newTreasury;
        emit TreasurySet(newTreasury);
    }

    /// @notice Pauses new bets only. Claims and refunds always keep working.
    function setBettingPaused(bool paused) external onlyRole(GUARDIAN_ROLE) {
        bettingPaused = paused;
        emit BettingPaused(paused);
    }
}
