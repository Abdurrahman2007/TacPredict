// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
/// @notice Bonded trusted-resolver beta. Not UMA and not a decentralized oracle.
contract ResolutionOracle is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    MarketRegistry public immutable registry; IERC20 public immutable usdc;
    uint256 public immutable bond; uint64 public immutable challengePeriod;
    struct Proposal { address proposer; address disputer; uint64 challengeDeadline; uint8 outcome; uint8 alternative; bool voided; bool alternativeVoid; bool finished; bytes32 evidenceHash; }
    mapping(uint256 => Proposal) public proposals; mapping(address => uint256) public credits;
    event ResolutionProposed(uint256 indexed marketId, address indexed proposer, uint8 outcome, bool voided, bytes32 evidenceHash, bytes32 sourceHash, uint64 sourceTimestamp, uint64 challengeDeadline);
    event ResolutionDisputed(uint256 indexed marketId, address indexed disputer, uint8 alternative, bool voided, bytes32 evidenceHash);
    event DisputeFinalized(uint256 indexed marketId, uint8 outcome, bool voided, bytes32 evidenceHash);
    event BondWithdrawn(address indexed account, uint256 amount);
    constructor(address admin, MarketRegistry registry_, uint256 bond_, uint64 challengePeriod_) {
        require(admin != address(0) && bond_ > 0 && challengePeriod_ >= 60, "Invalid oracle terms");
        registry = registry_; usdc = IERC20(registry_.collateralToken()); bond = bond_; challengePeriod = challengePeriod_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin); _grantRole(PROPOSER_ROLE, admin); _grantRole(ARBITER_ROLE, admin);
    }
    function propose(uint256 id, uint8 outcome, bool voided, bytes32 evidenceHash, bytes32 sourceHash, uint64 sourceTimestamp) external onlyRole(PROPOSER_ROLE) nonReentrant {
        MarketRegistry.Market memory m = registry.getMarket(id);
        require(proposals[id].proposer == address(0) && outcome < m.outcomeCount && evidenceHash != 0 && sourceHash == m.sourceHash, "Invalid proposal");
        require(sourceTimestamp >= m.closeAt && sourceTimestamp <= block.timestamp && block.timestamp + challengePeriod < m.resolutionDeadline, "Invalid observation/deadline");
        registry.markResolving(id); usdc.safeTransferFrom(msg.sender, address(this), bond);
        uint64 deadline = uint64(block.timestamp + challengePeriod);
        proposals[id] = Proposal(msg.sender, address(0), deadline, outcome, 0, voided, false, false, evidenceHash);
        emit ResolutionProposed(id, msg.sender, outcome, voided, evidenceHash, sourceHash, sourceTimestamp, deadline);
    }
    function dispute(uint256 id, uint8 alternative, bool alternativeVoid, bytes32 evidenceHash) external nonReentrant {
        Proposal storage p = proposals[id]; MarketRegistry.Market memory m = registry.getMarket(id);
        require(p.proposer != address(0) && !p.finished && p.disputer == address(0) && msg.sender != p.proposer, "Cannot dispute");
        require(block.timestamp < p.challengeDeadline && m.status == MarketRegistry.Status.RESOLVING && evidenceHash != 0 && alternative < m.outcomeCount, "Dispute expired");
        require(alternative != p.outcome || alternativeVoid != p.voided, "Same outcome");
        usdc.safeTransferFrom(msg.sender, address(this), bond); p.disputer = msg.sender; p.alternative = alternative; p.alternativeVoid = alternativeVoid;
        emit ResolutionDisputed(id, msg.sender, alternative, alternativeVoid, evidenceHash);
    }
    function finalize(uint256 id) external nonReentrant {
        Proposal storage p = proposals[id]; require(p.proposer != address(0) && p.disputer == address(0) && block.timestamp >= p.challengeDeadline && !p.finished, "Not finalizable");
        registry.finalize(id, p.outcome, p.voided); p.finished = true; credits[p.proposer] += bond;
    }
    function resolveDispute(uint256 id, uint8 outcome, bool voided, bytes32 evidenceHash) external onlyRole(ARBITER_ROLE) nonReentrant {
        Proposal storage p = proposals[id]; require(p.disputer != address(0) && !p.finished && block.timestamp >= p.challengeDeadline && evidenceHash != 0, "Not disputed");
        registry.finalize(id, outcome, voided); p.finished = true;
        if (outcome == p.outcome && voided == p.voided) credits[p.proposer] += bond * 2;
        else if (outcome == p.alternative && voided == p.alternativeVoid) credits[p.disputer] += bond * 2;
        else { credits[p.proposer] += bond; credits[p.disputer] += bond; }
        emit DisputeFinalized(id, outcome, voided, evidenceHash);
    }
    function releaseTimeoutBonds(uint256 id) external nonReentrant {
        Proposal storage p = proposals[id]; require(registry.getMarket(id).status == MarketRegistry.Status.VOID && !p.finished && p.proposer != address(0), "Not timed out");
        p.finished = true; credits[p.proposer] += bond; if (p.disputer != address(0)) credits[p.disputer] += bond;
    }
    function withdrawBondCredit() external nonReentrant { uint256 amount = credits[msg.sender]; require(amount > 0, "No credit"); credits[msg.sender] = 0; usdc.safeTransfer(msg.sender, amount); emit BondWithdrawn(msg.sender, amount); }
}
