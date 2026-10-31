// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Virtual USDC for TacPredict campaigns. It has no value, cannot be sent to another person and
/// cannot leave the trading contracts, so it can never be withdrawn or sold.
///
/// Three ways to receive a balance:
///  1. The welcome box, once per wallet, ever: a whole-dollar amount from 50 to 500 USDC that the platform draws at
///     random by its own choice (it does not depend on the address or anything else the contract can see).
///     The platform's box granter credits it with `grantBox`, paying the gas, so the user signs nothing. The
///     contract enforces only the range, whole dollars, once per wallet, a daily limit on boxes, and the on/off
///     switch. It can never be repeated or reversed.
///  2. `checkIn()`: one transaction per UTC day, signed and paid for by the wallet, after its box was credited.
///     Rewards 20, 30, 40, 50, 60, 70, 80 USDC on streak days 1 to 7, then 80 USDC a day while the streak lasts.
///     A missed day restarts at 20. It keeps working until the admin turns it off.
///  3. The admin, to fix glitches and run campaigns: `adminGrant()` adds any amount to a wallet and
///     `adminSetBalance()` sets a wallet's balance to exactly any amount, even zero. Adding is limited to
///     ADMIN_DAILY_GRANT_CAP (100,000 USDC) per wallet per UTC day; lowering a balance is not limited. Every change
///     is an event with the old balance, the new balance and a reason hash. The admin cannot touch the protocol
///     contracts' money (so no one's locked collateral or position can be taken), cannot move tokens between wallets
///     and cannot change positions. The admin can also switch the box and the check-in off or on.
///
/// Only the contracts on the protocol list can move tokens (`transfer` / `transferFrom` by anyone else
/// reverts). The list is set once by the admin during deployment and then locked for good. It is meant to
/// hold exactly ConditionalPositions, Exchange and ResolutionOracle of the virtual set.
///
/// Trust: the box amount is the platform's random draw and cannot be proven on chain. The box granter is a hot
/// server key; if it leaks, the daily box limit bounds the damage and the admin can switch boxes off or replace it.
/// Admin edits are a real power over virtual balances: use a Safe multisig as admin. There is no cap on total supply.
///
/// Gas for check-ins and trades is paid in ETH on Base. This token itself is never real money.
contract VirtualUSDC is ERC20 {
    uint256 public constant BOX_MIN = 50_000_000;
    uint256 public constant BOX_MAX = 500_000_000;
    uint256 public constant CHECKIN_BASE = 20_000_000;
    uint256 public constant CHECKIN_STEP = 10_000_000;
    uint256 public constant CHECKIN_DAYS = 7;
    uint256 public constant ADMIN_DAILY_GRANT_CAP = 100_000_000_000;
    uint256 private constant UNIT = 1_000_000;

    address public admin;
    address public pendingAdmin;
    address public boxGranter;
    uint256 public boxDailyCap;
    uint256 public boxDay;
    uint256 public boxesToday;

    bool public protocolLocked;
    bool public boxOpen = true;
    bool public checkInOpen = true;
    uint256 public boxesOpened;
    uint256 public totalBoxAmount;
    uint256 public totalCheckInAmount;
    uint256 public totalAdminAmount;
    uint256 public totalAdminBurned;
    mapping(address => bool) public protocol;
    mapping(address => bool) public boxClaimed;
    mapping(address => uint256) public lastCheckInDay;
    mapping(address => uint256) public streak;
    mapping(address => mapping(uint256 => uint256)) public adminGrantedOnDay;

    event ProtocolAllowed(address indexed account);
    event ProtocolLocked();
    event BoxOpened(address indexed account, uint256 amount);
    event CheckedIn(address indexed account, uint256 indexed day, uint256 streak, uint256 amount);
    event AdminGranted(address indexed account, uint256 amount, bytes32 reasonHash);
    event AdminAdjusted(address indexed account, uint256 previousBalance, uint256 newBalance, bytes32 reasonHash);
    event BoxGranterChanged(address indexed granter);
    event BoxDailyCapChanged(uint256 cap);
    event BoxSwitch(bool open);
    event CheckInSwitch(bool open);
    event AdminProposed(address indexed pending);
    event AdminChanged(address indexed previous, address indexed current);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor(address admin_, address boxGranter_, uint256 boxDailyCap_) ERC20("TacPredict Virtual USDC", "vUSDC") {
        require(block.chainid == 8453 || block.chainid == 84532, "Base only");
        require(admin_ != address(0) && boxDailyCap_ > 0, "Invalid setup");
        admin = admin_;
        boxGranter = boxGranter_;
        boxDailyCap = boxDailyCap_;
        emit BoxGranterChanged(boxGranter_);
        emit BoxDailyCapChanged(boxDailyCap_);
    }

    function decimals() public pure override returns (uint8) { return 6; }

    /// @dev The virtual MarketRegistry only accepts a collateral token that answers true here.
    function isVirtualCollateral() external pure returns (bool) { return true; }

    function allowProtocol(address account) external onlyAdmin {
        require(!protocolLocked && account.code.length > 0, "Cannot allow");
        protocol[account] = true;
        emit ProtocolAllowed(account);
    }

    function lockProtocol() external onlyAdmin {
        require(!protocolLocked, "Already locked");
        protocolLocked = true;
        emit ProtocolLocked();
    }

    function setBoxOpen(bool open) external onlyAdmin {
        boxOpen = open;
        emit BoxSwitch(open);
    }

    function setBoxGranter(address granter) external onlyAdmin {
        boxGranter = granter;
        emit BoxGranterChanged(granter);
    }

    function setBoxDailyCap(uint256 cap) external onlyAdmin {
        require(cap > 0, "Invalid cap");
        boxDailyCap = cap;
        emit BoxDailyCapChanged(cap);
    }

    function setCheckInOpen(bool open) external onlyAdmin {
        checkInOpen = open;
        emit CheckInSwitch(open);
    }

    function proposeAdmin(address next) external onlyAdmin {
        require(next != address(0), "Invalid admin");
        pendingAdmin = next;
        emit AdminProposed(next);
    }

    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "Not pending admin");
        emit AdminChanged(admin, msg.sender);
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    /// @notice Credit the welcome box. Only the platform's box granter, once per wallet ever, 50 to 500 whole USDC.
    function grantBox(address account, uint256 amount) external {
        require(msg.sender == boxGranter && boxGranter != address(0), "Only box granter");
        require(boxOpen, "Box closed");
        require(account != address(0) && !boxClaimed[account], "Box already opened");
        require(amount >= BOX_MIN && amount <= BOX_MAX && amount % UNIT == 0, "Invalid box amount");
        uint256 today = block.timestamp / 1 days;
        if (boxDay != today) {
            boxDay = today;
            boxesToday = 0;
        }
        require(boxesToday < boxDailyCap, "Daily box limit");
        boxesToday += 1;
        boxClaimed[account] = true;
        boxesOpened += 1;
        totalBoxAmount += amount;
        _mint(account, amount);
        emit BoxOpened(account, amount);
    }

    function checkIn() external returns (uint256 amount) {
        require(checkInOpen, "Check-in closed");
        require(boxClaimed[msg.sender], "Open the box first");
        uint256 today = block.timestamp / 1 days;
        uint256 last = lastCheckInDay[msg.sender];
        require(today > last, "Already checked in today");
        uint256 count = (last != 0 && today == last + 1) ? streak[msg.sender] + 1 : 1;
        streak[msg.sender] = count;
        lastCheckInDay[msg.sender] = today;
        uint256 rewardDay = count > CHECKIN_DAYS ? CHECKIN_DAYS : count;
        amount = CHECKIN_BASE + CHECKIN_STEP * (rewardDay - 1);
        totalCheckInAmount += amount;
        _mint(msg.sender, amount);
        emit CheckedIn(msg.sender, today, count, amount);
    }

    function _adminMint(address account, uint256 amount) private {
        uint256 today = block.timestamp / 1 days;
        uint256 used = adminGrantedOnDay[account][today] + amount;
        require(used <= ADMIN_DAILY_GRANT_CAP, "Daily admin cap exceeded");
        adminGrantedOnDay[account][today] = used;
        totalAdminAmount += amount;
        _mint(account, amount);
    }

    /// @notice Add `amount` to a wallet (up to the daily limit per wallet).
    function adminGrant(address account, uint256 amount, bytes32 reasonHash) external onlyAdmin {
        require(account != address(0) && amount > 0 && !protocol[account], "Cannot grant");
        _adminMint(account, amount);
        emit AdminGranted(account, amount, reasonHash);
    }

    /// @notice Set a wallet's balance to exactly `target`, even zero. Raising counts toward the daily limit.
    /// The protocol contracts' own balances (locked collateral, oracle bonds) can never be changed.
    function adminSetBalance(address account, uint256 target, bytes32 reasonHash) external onlyAdmin {
        require(account != address(0) && !protocol[account], "Cannot adjust");
        uint256 current = balanceOf(account);
        if (target > current) {
            _adminMint(account, target - current);
        } else if (target < current) {
            totalAdminBurned += current - target;
            _burn(account, current - target);
        }
        emit AdminAdjusted(account, current, target, reasonHash);
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
