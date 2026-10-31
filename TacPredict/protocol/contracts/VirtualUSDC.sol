// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Virtual USDC for TacPredict campaigns. It has no value, cannot be sent to another person and
/// cannot leave the trading contracts, so it can never be withdrawn or sold.
///
/// Three ways to receive a balance, all of them an onchain transaction that the wallet signs and pays gas for:
///  1. `openBox()`: once per wallet per season, a random whole-dollar amount from 50 to 500 USDC.
///  2. `checkIn()`: once per UTC day after the box was opened. The reward grows with the streak:
///     20, 30, 40, 50, 60, 70, 80 USDC on days 1 to 7, then it starts again at 20. A missed day restarts the streak.
///  3. `adminGrant()`: the admin can give a wallet a balance, but only inside a fixed per-season budget set at
///     deployment. Every grant is an event with a reason hash. The admin cannot take, burn or edit anyone's
///     balance, and cannot touch positions.
///
/// Only the contracts on the protocol list can move tokens (`transfer` / `transferFrom` by anyone else
/// reverts). The list is set once by the admin during deployment and then locked for good. It is meant to
/// hold exactly ConditionalPositions, Exchange and ResolutionOracle of the virtual set.
///
/// The admin can also open the next season, not sooner than MIN_SEASON_SECONDS after the last one. That does not
/// touch balances; it lets wallets open a box once more and resets the admin budget. If `resetOnClaim` was chosen
/// at deployment, opening a box in a new season first burns the wallet's unspent balance. Tokens inside open
/// positions are not touched.
///
/// Randomness limit: the box amount comes from `block.prevrandao`, the previous block hash, the wallet and a
/// counter. It is not secure against a sequencer, and a smart-contract wallet can simulate the box and revert until
/// it likes the result (it still pays gas for every try). Do not tie points or ranking to the size of the box.
///
/// Gas for every transaction is paid in ETH on Base. This token itself is never real money.
contract VirtualUSDC is ERC20 {
    uint256 public constant BOX_MIN = 50_000_000;
    uint256 public constant BOX_MAX = 500_000_000;
    uint256 public constant CHECKIN_BASE = 20_000_000;
    uint256 public constant CHECKIN_STEP = 10_000_000;
    uint256 public constant CHECKIN_DAYS = 7;
    uint256 public constant MIN_SEASON_SECONDS = 20 days;
    uint256 private constant UNIT = 1_000_000;

    address public immutable admin;
    bool public immutable resetOnClaim;
    uint256 public immutable adminSeasonBudget;

    bool public protocolLocked;
    uint256 public season = 1;
    uint64 public seasonStartedAt;
    uint256 public adminGrantedInSeason;
    uint256 public boxesOpened;
    uint256 public totalBoxAmount;
    uint256 public totalCheckInAmount;
    uint256 public totalAdminAmount;
    mapping(address => bool) public protocol;
    mapping(address => uint256) public boxSeason;
    mapping(address => uint256) public lastCheckInDay;
    mapping(address => uint256) public streak;

    event ProtocolAllowed(address indexed account);
    event ProtocolLocked();
    event SeasonStarted(uint256 indexed season, uint64 startedAt);
    event BoxOpened(address indexed account, uint256 indexed season, uint256 amount, uint256 burned);
    event CheckedIn(address indexed account, uint256 indexed day, uint256 streakDay, uint256 amount);
    event AdminGranted(address indexed account, uint256 indexed season, uint256 amount, bytes32 reasonHash);

    constructor(address admin_, bool resetOnClaim_, uint256 adminSeasonBudget_) ERC20("TacPredict Virtual USDC", "vUSDC") {
        require(block.chainid == 8453 || block.chainid == 84532, "Base only");
        require(admin_ != address(0), "Invalid admin");
        admin = admin_;
        resetOnClaim = resetOnClaim_;
        adminSeasonBudget = adminSeasonBudget_;
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
        adminGrantedInSeason = 0;
        emit SeasonStarted(season, seasonStartedAt);
    }

    function openBox() external returns (uint256 amount) {
        require(boxSeason[msg.sender] != season, "Box already opened");
        boxSeason[msg.sender] = season;
        uint256 burned;
        if (resetOnClaim) {
            burned = balanceOf(msg.sender);
            if (burned > 0) _burn(msg.sender, burned);
        }
        uint256 roll = uint256(keccak256(abi.encode(block.prevrandao, blockhash(block.number - 1), msg.sender, season, boxesOpened)));
        amount = BOX_MIN + (roll % ((BOX_MAX - BOX_MIN) / UNIT + 1)) * UNIT;
        boxesOpened += 1;
        totalBoxAmount += amount;
        _mint(msg.sender, amount);
        emit BoxOpened(msg.sender, season, amount, burned);
    }

    function checkIn() external returns (uint256 amount) {
        require(boxSeason[msg.sender] == season, "Open the box first");
        uint256 today = block.timestamp / 1 days;
        uint256 last = lastCheckInDay[msg.sender];
        require(today > last, "Already checked in today");
        uint256 day = streak[msg.sender];
        day = (last != 0 && today == last + 1 && day < CHECKIN_DAYS) ? day + 1 : 1;
        streak[msg.sender] = day;
        lastCheckInDay[msg.sender] = today;
        amount = CHECKIN_BASE + CHECKIN_STEP * (day - 1);
        totalCheckInAmount += amount;
        _mint(msg.sender, amount);
        emit CheckedIn(msg.sender, today, day, amount);
    }

    function adminGrant(address account, uint256 amount, bytes32 reasonHash) external {
        require(msg.sender == admin && account != address(0) && amount > 0, "Cannot grant");
        require(adminGrantedInSeason + amount <= adminSeasonBudget, "Admin budget exceeded");
        adminGrantedInSeason += amount;
        totalAdminAmount += amount;
        _mint(account, amount);
        emit AdminGranted(account, season, amount, reasonHash);
    }

    function totalGranted() external view returns (uint256) { return totalBoxAmount + totalCheckInAmount + totalAdminAmount; }

    function transfer(address to, uint256 value) public override returns (bool) {
        require(protocol[msg.sender], "Not transferable");
        return super.transfer(to, value);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        require(protocol[msg.sender], "Not transferable");
        return super.transferFrom(from, to, value);
    }
}
