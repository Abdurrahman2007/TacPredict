// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @notice Immutable market terms. No administrator can withdraw collateral or rewrite an open question.
contract MarketRegistry is AccessControl {
    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    enum Status { DRAFT, UPCOMING, OPEN, CLOSED, RESOLVING, RESOLVED, SETTLED, VOID, CANCELLED }
    struct Market {
        bytes32 questionId; bytes32 conditionId; bytes32 metadataHash;
        bytes32 rulesHash; bytes32 sourceHash; address oracle;
        uint64 createdAt; uint64 openAt; uint64 closeAt; uint64 resolveAfter; uint64 resolutionDeadline;
        uint8 outcomeCount; Status status;
    }
    address public immutable collateralToken;
    uint256 public nextMarketId = 1;
    bool public tradingPaused;
    mapping(uint256 => Market) private markets;
    mapping(bytes32 => bool) public conditionExists;
    mapping(uint256 => uint256[]) private payoutWeights;
    event MarketCreated(uint256 indexed marketId, bytes32 indexed questionId, bytes32 indexed conditionId, address oracle, uint8 outcomeCount, bytes32 metadataHash, bytes32 rulesHash, bytes32 sourceHash, uint64 openAt, uint64 closeAt, uint64 resolveAfter, uint64 resolutionDeadline);
    event MarketClosed(uint256 indexed marketId);
    event ResolutionFinalized(uint256 indexed marketId, uint256[] weights, bool voided);
    event TradingPaused(bool paused);
    constructor(address admin, address usdc) {
        require(admin != address(0) && usdc.code.length > 0, "Bad deployment");
        require(IERC20Metadata(usdc).decimals() == 6, "USDC decimals");
        collateralToken = usdc;
        _grantRole(DEFAULT_ADMIN_ROLE, admin); _grantRole(GUARDIAN_ROLE, admin);
    }
    function getMarket(uint256 id) public view returns (Market memory m) {
        m = markets[id]; require(m.oracle != address(0), "Unknown market");
        if (m.status == Status.UPCOMING || m.status == Status.OPEN || m.status == Status.CLOSED) {
            m.status = block.timestamp < m.openAt ? Status.UPCOMING : block.timestamp < m.closeAt ? Status.OPEN : Status.CLOSED;
        }
    }
    function create(bytes32 questionId, bytes32 metadataHash, bytes32 rulesHash, bytes32 sourceHash, address oracle, uint8 count, uint64 openAt, uint64 closeAt, uint64 resolveAfter, uint64 deadline) external onlyRole(FACTORY_ROLE) returns (uint256 id) {
        require(oracle.code.length > 0 && count >= 2 && count <= 8, "Invalid market");
        require(questionId != 0 && metadataHash != 0 && rulesHash != 0 && sourceHash != 0, "Missing terms");
        require(openAt >= block.timestamp && closeAt > openAt && resolveAfter >= closeAt && deadline > resolveAfter, "Invalid times");
        // TacPredict derivation uses abi.encode; this is NOT a claim of Gnosis CTF compatibility.
        bytes32 condition = keccak256(abi.encode(oracle, questionId, uint256(count)));
        require(!conditionExists[condition], "Duplicate condition"); conditionExists[condition] = true;
        id = nextMarketId++;
        markets[id] = Market(questionId, condition, metadataHash, rulesHash, sourceHash, oracle, uint64(block.timestamp), openAt, closeAt, resolveAfter, deadline, count, Status.UPCOMING);
        emit MarketCreated(id, questionId, condition, oracle, count, metadataHash, rulesHash, sourceHash, openAt, closeAt, resolveAfter, deadline);
    }
    function isTradingOpen(uint256 id) external view returns (bool) { return !tradingPaused && getMarket(id).status == Status.OPEN; }
    function pauseTrading(bool value) external onlyRole(GUARDIAN_ROLE) { tradingPaused = value; emit TradingPaused(value); }
    function checkpointClose(uint256 id) external { require(getMarket(id).status == Status.CLOSED, "Not closed"); require(markets[id].status != Status.CLOSED, "Already closed"); markets[id].status = Status.CLOSED; emit MarketClosed(id); }
    function markResolving(uint256 id) external onlyRole(ORACLE_ROLE) {
        Market memory m = getMarket(id); require(msg.sender == m.oracle && m.status == Status.CLOSED && block.timestamp >= m.resolveAfter && block.timestamp < m.resolutionDeadline, "Not resolvable");
        markets[id].status = Status.RESOLVING;
    }
    function finalize(uint256 id, uint8 outcome, bool voided) external onlyRole(ORACLE_ROLE) {
        Market memory m = getMarket(id); require(msg.sender == m.oracle && m.status == Status.RESOLVING && block.timestamp < m.resolutionDeadline, "Not resolving");
        require(outcome < m.outcomeCount, "Invalid outcome"); _setPayout(id, outcome, voided);
    }
    function timeoutVoid(uint256 id) external {
        Market memory m = getMarket(id); require(block.timestamp >= m.resolutionDeadline, "Before timeout");
        require(m.status == Status.CLOSED || m.status == Status.RESOLVING || m.status == Status.UPCOMING || m.status == Status.OPEN, "Already terminal");
        _setPayout(id, 0, true);
    }
    function _setPayout(uint256 id, uint8 outcome, bool voided) private {
        uint8 count = markets[id].outcomeCount;
        for (uint8 i; i < count; ++i) payoutWeights[id].push(voided ? 1 : (i == outcome ? 1 : 0));
        markets[id].status = voided ? Status.VOID : Status.RESOLVED;
        emit ResolutionFinalized(id, payoutWeights[id], voided);
    }
    function payouts(uint256 id) external view returns (uint256[] memory weights, uint256 denominator) {
        Market memory m = getMarket(id); require(m.status == Status.RESOLVED || m.status == Status.VOID, "Unresolved");
        weights = payoutWeights[id]; denominator = m.status == Status.VOID ? m.outcomeCount : 1;
    }
}
