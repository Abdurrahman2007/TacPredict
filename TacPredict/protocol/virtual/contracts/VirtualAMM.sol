// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @notice Nontransferable virtual accounting. No ERC20, collateral, deposit or redemption calls.
/// @dev Finite FPMM, 2/3 outcomes, conservative integer rounding. Not independently audited.
contract VirtualAMM is AccessControl {
    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant WATCHER_ROLE = keccak256("WATCHER_ROLE");
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    bytes32 private constant TRADE_SLOT = keccak256("TacPredict.virtual.trade.once.v1");
    uint256 private constant MAX64 = type(uint64).max;
    uint256 public constant UNIT = 1e6;

    struct Terms {
        bytes32 rulesHash;
        uint64 openAt;
        uint64 closeAt;
        uint64 resolveAfter;
        uint64 resolutionDeadline;
        uint32 challengePeriod;
        uint64 seed;
        uint64 reserveFloor;
        uint64 maxCashIn;
        uint64 maxSharesIn;
        uint64 maxPosition;
        uint16 feeBps;
        uint8 outcomes;
    }
    struct Pool {
        Terms terms;
        uint64[3] reserves;
        uint128 collateral;
        uint64 revision;
        bool paused;
        bool final_;
        bool voided;
        uint8 winner;
    }
    struct Position { uint64 shares; uint128 basis; int256 realizedPnl; }
    struct Proposal {
        bytes32 evidenceHash;
        uint64 challengeUntil;
        bool exists;
        bool disputed;
        bool voided;
        uint8 winner;
    }
    struct Campaign { bytes32 root; uint128 budget; uint128 used; uint64 endsAt; }
    struct Quote { uint64 output; uint64 fee; uint64 revision; }

    uint128 public immutable seedBudget;
    uint128 public immutable grantBudget;
    uint128 public seeded;
    uint128 public granted;
    uint128 public totalCash;
    uint128 public lockedCollateral;
    uint128 public feeSink;
    uint128 public protocolSink;
    uint128 public campaignBudgetReserved;
    uint256 public poolCount;
    uint256 public campaignCount;
    bool public tradingPaused;
    mapping(uint256 => Pool) private pools;
    mapping(uint256 => Proposal) public proposals;
    mapping(address => uint128) public cash;
    mapping(address => uint256) public actionNonce;
    mapping(uint256 => mapping(address => mapping(uint8 => Position))) public positions;
    mapping(uint256 => mapping(address => bool)) public settled;
    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => mapping(address => bool)) public campaignClaimed;

    event PoolCreated(uint256 indexed marketId, Terms terms);
    event CampaignConfigured(uint256 indexed campaignId, bytes32 root, uint128 budget, uint64 endsAt);
    event VirtualGrant(uint256 indexed campaignId, address indexed wallet, uint128 amount);
    event TradeExecuted(address indexed wallet, uint256 indexed marketId, uint256 indexed nonce,
        uint8 outcome, bool isBuy, uint64 input, uint64 output, uint64 fee, uint64 revision,
        uint64 remainingShares, uint128 remainingBasis, int256 realizedPnlDelta, uint128 cashAfter);
    event PositionSettled(address indexed wallet, uint256 indexed marketId, uint128 payout,
        int256 realizedPnlDelta, uint128 cashAfter);
    event ResultProposed(uint256 indexed marketId, uint8 winner, bool voided, bytes32 evidenceHash, uint64 challengeUntil);
    event ResultChallenged(uint256 indexed marketId, bytes32 evidenceHash);
    event ResultFinalized(uint256 indexed marketId, uint8 winner, bool voided, bytes32 evidenceHash);
    event TradingPauseChanged(uint256 indexed marketId, bool paused); // market 0 = global

    error Invalid(); error Closed(); error Paused(); error Stale(); error Slippage();
    error Liquidity(); error Balance(); error Replay(); error AlreadyTraded(); error NotFinal();

    constructor(address admin, uint128 seedBudget_, uint128 grantBudget_) {
        if (admin == address(0) || uint256(seedBudget_) + grantBudget_ > type(uint128).max) revert Invalid();
        seedBudget = seedBudget_; grantBudget = grantBudget_;
        // No creator/resolver/guardian roles, markets, campaigns or grants are enabled automatically.
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }
    modifier oneTrade() {
        bytes32 slot = TRADE_SLOT;
        bool used;
        assembly { used := tload(slot) }
        if (used) revert AlreadyTraded();
        assembly { tstore(slot, 1) }
        // Do not clear: sequential wallet calls/UserOperations in the SAME tx must not both trade.
        _;
    }
    function pool(uint256 id) public view returns (Pool memory p) {
        p = pools[id]; if (p.terms.outcomes == 0) revert Invalid();
    }
    function configureCampaign(bytes32 root, uint128 budget, uint64 endsAt)
        external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 id)
    {
        if (root == bytes32(0) || budget == 0 || endsAt <= block.timestamp ||
            uint256(campaignBudgetReserved) + budget > grantBudget) revert Invalid();
        campaignBudgetReserved += budget;
        id = ++campaignCount; campaigns[id] = Campaign(root, budget, 0, endsAt);
        emit CampaignConfigured(id, root, budget, endsAt);
    }
    function claimGrant(uint256 id, uint128 amount, bytes32[] calldata proof) external {
        Campaign storage c = campaigns[id];
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(address(this), block.chainid, id, msg.sender, amount))));
        if (amount == 0 || campaignClaimed[id][msg.sender] || block.timestamp >= c.endsAt ||
            uint256(c.used) + amount > c.budget || !MerkleProof.verify(proof, c.root, leaf)) revert Invalid();
        campaignClaimed[id][msg.sender] = true; c.used += amount;
        granted += amount; cash[msg.sender] += amount; totalCash += amount;
        emit VirtualGrant(id, msg.sender, amount);
    }
    function createPool(Terms calldata t) external onlyRole(CREATOR_ROLE) returns (uint256 id) {
        if (t.rulesHash == 0 || t.outcomes < 2 || t.outcomes > 3 || t.openAt < block.timestamp ||
            t.closeAt <= t.openAt || t.resolveAfter < t.closeAt || t.challengePeriod == 0 ||
            t.resolutionDeadline <= uint256(t.resolveAfter) + t.challengePeriod ||
            t.seed == 0 || t.reserveFloor == 0 || t.reserveFloor >= t.seed ||
            t.maxCashIn == 0 || t.maxSharesIn == 0 || t.maxPosition == 0 || t.feeBps > 1000 ||
            uint256(seeded) + t.seed > seedBudget) revert Invalid();
        id = ++poolCount; Pool storage p = pools[id]; p.terms = t; p.revision = 1;
        for (uint8 j; j < t.outcomes; ++j) p.reserves[j] = t.seed;
        p.collateral = t.seed; seeded += t.seed; lockedCollateral += t.seed;
        emit PoolCreated(id, t);
    }
    function setPaused(uint256 id, bool value) external {
        if (value) _checkRole(GUARDIAN_ROLE); else _checkRole(DEFAULT_ADMIN_ROLE);
        if (id == 0) tradingPaused = value;
        else { pool(id); pools[id].paused = value; pools[id].revision++; }
        emit TradingPauseChanged(id, value);
    }
    function _open(Pool memory p, uint8 outcome) private view {
        if (outcome >= p.terms.outcomes) revert Invalid();
        if (tradingPaused || p.paused) revert Paused();
        if (p.final_ || block.timestamp < p.terms.openAt || block.timestamp >= p.terms.closeAt) revert Closed();
    }
    function _product(uint64[3] memory r, uint8 n) private pure returns (uint256 k) {
        k = 1; for (uint8 j; j < n; ++j) k *= r[j];
    }
    function _fee(uint256 amount, uint16 bps) private pure returns (uint256) {
        return (amount * bps + 9999) / 10000;
    }
    function _buy(Pool memory p, uint8 outcome, uint64 amount)
        private view returns (Quote memory q, uint64[3] memory r)
    {
        _open(p, outcome);
        if (amount == 0 || amount > p.terms.maxCashIn) revert Invalid();
        uint256 f = _fee(amount, p.terms.feeBps); uint256 x = amount - f;
        if (x == 0) revert Invalid();
        uint256 k = _product(p.reserves, p.terms.outcomes);
        r = p.reserves; uint256 denominator = 1;
        for (uint8 j; j < p.terms.outcomes; ++j) if (j != outcome) {
            uint256 v = uint256(r[j]) + x; if (v > MAX64) revert Liquidity();
            r[j] = uint64(v); denominator *= v;
        }
        uint256 reserve = (k + denominator - 1) / denominator;
        uint256 output = uint256(p.reserves[outcome]) + x - reserve;
        if (reserve < p.terms.reserveFloor || reserve > MAX64 || output == 0 || output > MAX64) revert Liquidity();
        r[outcome] = uint64(reserve); q = Quote(uint64(output), uint64(f), p.revision);
    }
    function _sell(Pool memory p, uint8 outcome, uint64 amount)
        private view returns (Quote memory q, uint64[3] memory r, uint64 gross)
    {
        _open(p, outcome);
        if (amount == 0 || amount > p.terms.maxSharesIn) revert Invalid();
        uint256 k = _product(p.reserves, p.terms.outcomes);
        uint256 high = p.collateral; if (high > MAX64) high = MAX64;
        for (uint8 j; j < p.terms.outcomes; ++j) {
            uint256 v = uint256(p.reserves[j]) + (j == outcome ? amount : 0) - p.terms.reserveFloor;
            if (v < high) high = v;
        }
        uint256 low;
        while (low < high) {
            uint256 y = (low + high + 1) / 2; uint256 candidate = 1;
            for (uint8 j; j < p.terms.outcomes; ++j)
                candidate *= uint256(p.reserves[j]) + (j == outcome ? amount : 0) - y;
            if (candidate >= k) low = y; else high = y - 1;
        }
        uint256 f = _fee(low, p.terms.feeBps);
        if (low <= f) revert Liquidity();
        for (uint8 j; j < p.terms.outcomes; ++j) {
            uint256 v = uint256(p.reserves[j]) + (j == outcome ? amount : 0) - low;
            if (v > MAX64) revert Liquidity(); r[j] = uint64(v);
        }
        gross = uint64(low); q = Quote(uint64(low - f), uint64(f), p.revision);
    }
    function quoteBuy(uint256 id, uint8 outcome, uint64 amount) external view returns (Quote memory q) {
        (q,) = _buy(pool(id), outcome, amount);
    }
    function quoteSell(uint256 id, uint8 outcome, uint64 amount) external view returns (Quote memory q) {
        (q,,) = _sell(pool(id), outcome, amount);
    }
    function _request(Pool memory p, uint64 revision, uint64 deadline, uint256 nonce) private {
        if (deadline < block.timestamp || revision != p.revision) revert Stale();
        if (nonce != actionNonce[msg.sender]) revert Replay();
        actionNonce[msg.sender] = nonce + 1;
    }
    function buy(uint256 id, uint8 outcome, uint64 amount, uint64 minOut, uint64 revision, uint64 deadline, uint256 nonce)
        external oneTrade
    {
        Pool memory before_ = pool(id); _request(before_, revision, deadline, nonce);
        (Quote memory q, uint64[3] memory r) = _buy(before_, outcome, amount);
        if (minOut == 0 || q.output < minOut) revert Slippage();
        if (cash[msg.sender] < amount) revert Balance();
        Position storage pos = positions[id][msg.sender][outcome];
        if (uint256(pos.shares) + q.output > before_.terms.maxPosition) revert Liquidity();
        cash[msg.sender] -= amount; totalCash -= amount;
        pos.shares += q.output; pos.basis += amount;
        uint64 net = amount - q.fee; Pool storage p = pools[id];
        p.reserves = r; p.collateral += net; p.revision++;
        lockedCollateral += net; feeSink += q.fee;
        emit TradeExecuted(msg.sender, id, nonce, outcome, true, amount, q.output, q.fee, p.revision,
            pos.shares, pos.basis, 0, cash[msg.sender]);
    }
    function sell(uint256 id, uint8 outcome, uint64 shares, uint64 minOut, uint64 revision, uint64 deadline, uint256 nonce)
        external oneTrade
    {
        Pool memory before_ = pool(id); _request(before_, revision, deadline, nonce);
        Position storage pos = positions[id][msg.sender][outcome];
        if (shares == 0 || pos.shares < shares) revert Balance();
        (Quote memory q, uint64[3] memory r, uint64 gross) = _sell(before_, outcome, shares);
        if (minOut == 0 || q.output < minOut) revert Slippage();
        uint128 removed = shares == pos.shares ? pos.basis : uint128(uint256(pos.basis) * shares / pos.shares);
        int256 delta = int256(uint256(q.output)) - int256(uint256(removed));
        pos.shares -= shares; pos.basis -= removed; pos.realizedPnl += delta;
        cash[msg.sender] += q.output; totalCash += q.output;
        Pool storage p = pools[id]; p.reserves = r; p.collateral -= gross; p.revision++;
        lockedCollateral -= gross; feeSink += q.fee;
        emit TradeExecuted(msg.sender, id, nonce, outcome, false, shares, q.output, q.fee, p.revision,
            pos.shares, pos.basis, delta, cash[msg.sender]);
    }
    function propose(uint256 id, uint8 winner, bool voided, bytes32 evidenceHash) external onlyRole(PROPOSER_ROLE) {
        Pool memory p = pool(id); uint256 until = block.timestamp + p.terms.challengePeriod;
        if (p.final_ || proposals[id].exists || block.timestamp < p.terms.resolveAfter ||
            until >= p.terms.resolutionDeadline || evidenceHash == 0 || winner >= p.terms.outcomes) revert Invalid();
        proposals[id] = Proposal(evidenceHash, uint64(until), true, false, voided, winner);
        emit ResultProposed(id, winner, voided, evidenceHash, uint64(until));
    }
    function challenge(uint256 id, bytes32 evidenceHash) external onlyRole(WATCHER_ROLE) {
        Proposal storage a = proposals[id];
        if (!a.exists || a.disputed || block.timestamp >= a.challengeUntil || pools[id].final_ || evidenceHash == 0) revert Invalid();
        a.disputed = true; emit ResultChallenged(id, evidenceHash);
    }
    function finalize(uint256 id) external {
        Proposal memory a = proposals[id]; Pool memory p = pool(id);
        if (!a.exists || a.disputed || block.timestamp < a.challengeUntil || block.timestamp >= p.terms.resolutionDeadline) revert Invalid();
        _final(id, a.winner, a.voided, a.evidenceHash);
    }
    function adjudicate(uint256 id, uint8 winner, bool voided, bytes32 evidenceHash) external onlyRole(ARBITER_ROLE) {
        Pool memory p = pool(id); Proposal memory a = proposals[id];
        if (!a.disputed || block.timestamp < a.challengeUntil || block.timestamp >= p.terms.resolutionDeadline ||
            winner >= p.terms.outcomes || evidenceHash == 0) revert Invalid();
        _final(id, winner, voided, evidenceHash);
    }
    function timeoutVoid(uint256 id) external {
        Pool memory p = pool(id); if (block.timestamp < p.terms.resolutionDeadline) revert Invalid();
        _final(id, 0, true, p.terms.rulesHash);
    }
    function _final(uint256 id, uint8 winner, bool voided, bytes32 evidenceHash) private {
        Pool storage p = pools[id]; if (p.final_) revert Invalid();
        p.final_ = true; p.voided = voided; p.winner = winner; p.revision++;
        uint256 retired;
        if (voided) { for (uint8 j; j < p.terms.outcomes; ++j) retired += p.reserves[j]; retired /= p.terms.outcomes; }
        else retired = p.reserves[winner];
        p.collateral -= uint128(retired); lockedCollateral -= uint128(retired); protocolSink += uint128(retired);
        emit ResultFinalized(id, winner, voided, evidenceHash);
    }
    function claimable(uint256 id, address owner) public view returns (uint128 payout) {
        Pool memory p = pool(id); if (!p.final_ || settled[id][owner]) return 0;
        uint256 value;
        if (p.voided) { for (uint8 j; j < p.terms.outcomes; ++j) value += positions[id][owner][j].shares; value /= p.terms.outcomes; }
        else value = positions[id][owner][p.winner].shares;
        return uint128(value);
    }
    function settleFor(uint256 id, address owner) external {
        Pool storage p = pools[id]; if (!p.final_) revert NotFinal();
        if (settled[id][owner]) revert Invalid();
        uint128 payout = claimable(id, owner); int256 basis;
        uint256 numerator; uint256 allocated;
        for (uint8 j; j < p.terms.outcomes; ++j) {
            Position storage pos = positions[id][owner][j]; basis += int256(uint256(pos.basis));
            uint256 outcomePayout;
            if (p.voided) {
                numerator += pos.shares;
                uint256 target = numerator / p.terms.outcomes;
                outcomePayout = target - allocated; allocated = target;
            } else outcomePayout = j == p.winner ? pos.shares : 0;
            pos.realizedPnl += int256(outcomePayout) - int256(uint256(pos.basis));
            pos.shares = 0; pos.basis = 0;
        }
        settled[id][owner] = true; p.collateral -= payout; lockedCollateral -= payout;
        cash[owner] += payout; totalCash += payout;
        emit PositionSettled(owner, id, payout, int256(uint256(payout)) - basis, cash[owner]);
    }
    function markValue(uint256 id, address owner) external view returns (uint128 value, int256 unrealizedPnl) {
        Pool memory p = pool(id); uint256 basis;
        for (uint8 j; j < p.terms.outcomes; ++j) basis += positions[id][owner][j].basis;
        if (p.final_) value = claimable(id, owner);
        else {
            uint256[3] memory weights; uint256 denominator;
            for (uint8 i; i < p.terms.outcomes; ++i) {
                uint256 w = 1; for (uint8 j; j < p.terms.outcomes; ++j) if (i != j) w *= p.reserves[j];
                weights[i] = w; denominator += w;
            }
            uint256 sum;
            for (uint8 j; j < p.terms.outcomes; ++j) sum += uint256(positions[id][owner][j].shares) * weights[j] / denominator;
            value = uint128(sum);
        }
        unrealizedPnl = int256(uint256(value)) - int256(basis);
    }
}
