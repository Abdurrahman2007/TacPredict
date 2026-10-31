// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Virtual USDC for TacPredict campaigns. It has no value, cannot be sent to another person and
/// cannot leave the trading contracts, so it can never be withdrawn or sold. Nothing is ever burned from a wallet.
///
/// Three ways to receive a balance:
///  1. The welcome box, once per wallet, ever: a whole-dollar amount from 50 to 500 USDC that is fixed per wallet
///     by a hash (`boxAmount(wallet)`), so the app can show the box opening without any transaction. The amount is
///     credited by `claimBox(wallet)`, which anyone may call (the platform can pay that gas for new users) and
///     which is also done automatically inside the wallet's first `checkIn()`. It can never be repeated or reversed.
///  2. `checkIn()`: one transaction per UTC day, signed and paid for by the wallet. Rewards 20, 30, 40, 50, 60, 70,
///     80 USDC on streak days 1 to 7, then 80 USDC a day while the streak lasts. A missed day restarts at 20.
///     It keeps working until the admin turns it off.
///  3. `adminGrant()`: the admin can fund a wallet, at most ADMIN_ACCOUNT_CAP (100,000 USDC) in total per wallet.
///     Every grant is an event with a reason hash. The admin cannot take, burn or edit any balance and cannot
///     touch positions. The admin can also switch the box and the check-in off or on (this only stops new credits).
///
/// Only the contracts on the protocol list can move tokens (`transfer` / `transferFrom` by anyone else
/// reverts). The list is set once by the admin during deployment and then locked for good. It is meant to
/// hold exactly ConditionalPositions, Exchange and ResolutionOracle of the virtual set.
///
/// The box amount is pseudo-random: it is fixed per wallet address by a hash with a salt chosen at deployment.
/// Anyone can search offline for an address with a high box, so points and ranking must not depend on box size.
/// There is no cap on total supply: it is bounded by wallets, days and the admin's grants.
///
/// Gas for check-ins and trades is paid in ETH on Base. This token itself is never real money.
contract VirtualUSDC is ERC20 {
    uint256 public constant BOX_MIN = 50_000_000;
    uint256 public constant BOX_MAX = 500_000_000;
    uint256 public constant CHECKIN_BASE = 20_000_000;
    uint256 public constant CHECKIN_STEP = 10_000_000;
    uint256 public constant CHECKIN_DAYS = 7;
    uint256 public constant ADMIN_ACCOUNT_CAP = 100_000_000_000;
    uint256 private constant UNIT = 1_000_000;

    address public admin;
    address public pendingAdmin;
    bytes32 public immutable boxSalt;

    bool public protocolLocked;
    bool public boxOpen = true;
    bool public checkInOpen = true;
    uint256 public boxesOpened;
    uint256 public totalBoxAmount;
    uint256 public totalCheckInAmount;
    uint256 public totalAdminAmount;
    mapping(address => bool) public protocol;
    mapping(address => bool) public boxClaimed;
    mapping(address => uint256) public lastCheckInDay;
    mapping(address => uint256) public streak;
    mapping(address => uint256) public adminGranted;

    event ProtocolAllowed(address indexed account);
    event ProtocolLocked();
    event BoxOpened(address indexed account, uint256 amount);
    event CheckedIn(address indexed account, uint256 indexed day, uint256 streak, uint256 amount);
    event AdminGranted(address indexed account, uint256 amount, bytes32 reasonHash);
    event BoxSwitch(bool open);
    event CheckInSwitch(bool open);
    event AdminProposed(address indexed pending);
    event AdminChanged(address indexed previous, address indexed current);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor(address admin_) ERC20("TacPredict Virtual USDC", "vUSDC") {
        require(block.chainid == 8453 || block.chainid == 84532, "Base only");
        require(admin_ != address(0), "Invalid admin");
        admin = admin_;
        boxSalt = keccak256(abi.encode(block.chainid, address(this), blockhash(block.number - 1)));
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

    /// @notice The welcome box this wallet will receive. Pure computation: no transaction needed to show it.
    function boxAmount(address account) public view returns (uint256) {
        uint256 roll = uint256(keccak256(abi.encode(boxSalt, account)));
        return BOX_MIN + (roll % ((BOX_MAX - BOX_MIN) / UNIT + 1)) * UNIT;
    }

    /// @notice Credit the welcome box to `account`. Anyone may pay the gas; the amount and the receiver are fixed.
    function claimBox(address account) external returns (uint256) {
        require(account != address(0), "Invalid account");
        return _claimBox(account);
    }

    function _claimBox(address account) private returns (uint256 amount) {
        require(boxOpen, "Box closed");
        require(!boxClaimed[account], "Box already opened");
        boxClaimed[account] = true;
        amount = boxAmount(account);
        boxesOpened += 1;
        totalBoxAmount += amount;
        _mint(account, amount);
        emit BoxOpened(account, amount);
    }

    function checkIn() external returns (uint256 amount) {
        require(checkInOpen, "Check-in closed");
        if (boxOpen && !boxClaimed[msg.sender]) _claimBox(msg.sender);
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

    function adminGrant(address account, uint256 amount, bytes32 reasonHash) external onlyAdmin {
        require(account != address(0) && amount > 0, "Cannot grant");
        require(adminGranted[account] + amount <= ADMIN_ACCOUNT_CAP, "Account cap exceeded");
        adminGranted[account] += amount;
        totalAdminAmount += amount;
        _mint(account, amount);
        emit AdminGranted(account, amount, reasonHash);
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
