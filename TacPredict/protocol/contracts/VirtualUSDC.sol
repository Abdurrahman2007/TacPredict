// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Virtual USDC for TacPredict seasons. It has no value, cannot be sent to another person and
/// cannot leave the trading contracts, so it can never be withdrawn or sold.
///
/// How it works:
///  - Every wallet can call `claim()` once per season and receives exactly GRANT (500 USDC, six decimals).
///    There is no other way to create a balance: no administrator mint, no balance setter.
///  - Only the contracts on the protocol list can move tokens (`transfer` / `transferFrom` by anyone else
///    reverts). The list is set once by the admin during deployment and then locked for good. It is meant to
///    hold exactly ConditionalPositions, Exchange and ResolutionOracle of the virtual set.
///  - The admin can only open the next season, and not sooner than MIN_SEASON_SECONDS after the last one.
///    Opening a season does not touch anyone's balance; it only lets wallets claim once more.
///  - If `resetOnClaim` was chosen at deployment, a claim in a new season first burns the wallet's unspent
///    balance, so everyone starts the season with exactly GRANT. Tokens inside open positions are not touched.
///
/// Gas for every transaction is paid in ETH on Base. This token itself is never real money.
contract VirtualUSDC is ERC20 {
    uint256 public constant GRANT = 500_000_000;
    uint256 public constant MIN_SEASON_SECONDS = 20 days;

    address public immutable admin;
    bool public immutable resetOnClaim;
    bool public protocolLocked;
    uint256 public season = 1;
    uint64 public seasonStartedAt;
    uint256 public totalGranted;
    mapping(address => bool) public protocol;
    mapping(address => uint256) public claimedSeason;

    event ProtocolAllowed(address indexed account);
    event ProtocolLocked();
    event SeasonStarted(uint256 indexed season, uint64 startedAt);
    event Claimed(address indexed account, uint256 indexed season, uint256 burned, uint256 granted);

    constructor(address admin_, bool resetOnClaim_) ERC20("TacPredict Virtual USDC", "vUSDC") {
        require(block.chainid == 8453 || block.chainid == 84532, "Base only");
        require(admin_ != address(0), "Invalid admin");
        admin = admin_;
        resetOnClaim = resetOnClaim_;
        seasonStartedAt = uint64(block.timestamp);
        emit SeasonStarted(1, seasonStartedAt);
    }

    function decimals() public pure override returns (uint8) { return 6; }

    /// @dev The virtual MarketRegistry only accepts a collateral token that answers true here.
    function isVirtualCollateral() external pure returns (bool) { return true; }

    function allowProtocol(address account) external {
        require(msg.sender == admin && !protocolLocked && account.code.length > 0, "Cannot allow");
        protocol[account] = true;
        emit ProtocolAllowed(account);
    }

    function lockProtocol() external {
        require(msg.sender == admin && !protocolLocked, "Cannot lock");
        protocolLocked = true;
        emit ProtocolLocked();
    }

    function startSeason() external {
        require(msg.sender == admin && block.timestamp >= uint256(seasonStartedAt) + MIN_SEASON_SECONDS, "Season not ready");
        season += 1;
        seasonStartedAt = uint64(block.timestamp);
        emit SeasonStarted(season, seasonStartedAt);
    }

    function claim() external returns (uint256) {
        require(claimedSeason[msg.sender] != season, "Already claimed");
        claimedSeason[msg.sender] = season;
        uint256 burned;
        if (resetOnClaim) {
            burned = balanceOf(msg.sender);
            if (burned > 0) _burn(msg.sender, burned);
        }
        totalGranted += GRANT;
        _mint(msg.sender, GRANT);
        emit Claimed(msg.sender, season, burned, GRANT);
        return GRANT;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        require(protocol[msg.sender], "Not transferable");
        return super.transfer(to, value);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        require(protocol[msg.sender], "Not transferable");
        return super.transferFrom(from, to, value);
    }
}
