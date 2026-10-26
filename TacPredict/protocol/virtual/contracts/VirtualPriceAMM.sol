// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @notice Nontransferable virtual accounting. No ERC20, collateral, deposit or redemption calls.
/// @dev REVIEW ONLY. Binary feed-priced finite virtual inventory; NOT independently audited.
interface IVirtualPriceFeed {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80,int256,uint256,uint256,uint80);
    function getRoundData(uint80) external view returns (uint80,int256,uint256,uint256,uint80);
}

contract VirtualPriceAMM is AccessControl {
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
    struct Campaign {
        bytes32 root; uint128 budget; uint128 used; uint64 endsAt;
        uint64 startsAt; uint128 maxPerWallet; bool paused; bool cancelled;
    }
    struct PricePolicy {
        address feed; address sequencer; bytes32 asset;
        uint32 maxAge; uint32 boundaryTolerance; uint32 sigmaPpm;
        uint32 spreadPpm; uint32 impactPpm; uint32 skewPpm; uint32 minProbabilityPpm;
        uint128 minSpot; uint128 maxSpot; bool tieVoids;
    }
    mapping(uint256 => PricePolicy) public pricePolicies;
    mapping(uint256 => uint128) public startPrice;
    mapping(uint256 => uint80) public startRound;
    mapping(bytes32 => uint256) public monthlyCampaign;
    event PricePolicyFrozen(uint256 indexed marketId, PricePolicy policy);
    event StartPriceCaptured(uint256 indexed marketId, uint80 round, uint128 price);
    event CampaignState(uint256 indexed campaignId, bool paused, bool cancelled);
    event MonthlyCampaign(bytes32 indexed month, uint256 indexed campaignId, bytes32 eligibilityHash, uint64 startsAt, uint128 maxPerWallet);

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
    // The old convenience ABI is intentionally disabled: no implicit start/eligibility policy.
    function configureCampaign(bytes32, uint128, uint64) external pure returns (uint256) { revert Invalid(); }
    function configureMonthlyCampaign(bytes32 month, bytes32 root, uint128 budget,
        uint64 startsAt, uint64 endsAt, uint128 maxPerWallet, bytes32 eligibilityHash)
        external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 id)
    {
        if (month == 0 || monthlyCampaign[month] != 0 || eligibilityHash == 0 || root == 0 || budget == 0 ||
            maxPerWallet == 0 || maxPerWallet > budget || startsAt < block.timestamp || endsAt <= startsAt ||
            uint256(campaignBudgetReserved) + budget > grantBudget) revert Invalid();
        campaignBudgetReserved += budget; id = ++campaignCount; monthlyCampaign[month] = id;
        campaigns[id] = Campaign(root, budget, 0, endsAt, startsAt, maxPerWallet, false, false);
        emit CampaignConfigured(id, root, budget, endsAt);
        emit MonthlyCampaign(month, id, eligibilityHash, startsAt, maxPerWallet);
    }
    function setCampaignState(uint256 id, bool paused, bool cancel) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Campaign storage c = campaigns[id];
        if (c.root == 0 || c.cancelled) revert Invalid();
        c.paused = paused;
        if (cancel) { c.cancelled = true; campaignBudgetReserved -= c.budget - c.used; }
        emit CampaignState(id, paused, cancel);
    }
    function claimGrant(uint256 id, uint128 amount, bytes32[] calldata proof) external {
        Campaign storage c = campaigns[id];
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(address(this), block.chainid, id, msg.sender, amount))));
        if (c.paused || c.cancelled || block.timestamp < c.startsAt || amount > c.maxPerWallet || amount == 0 || campaignClaimed[id][msg.sender] || block.timestamp >= c.endsAt ||
            uint256(c.used) + amount > c.budget || !MerkleProof.verify(proof, c.root, leaf)) revert Invalid();
        campaignClaimed[id][msg.sender] = true; c.used += amount;
        granted += amount; cash[msg.sender] += amount; totalCash += amount;
        emit VirtualGrant(id, msg.sender, amount);
    }
    function createPool(Terms calldata t) external onlyRole(CREATOR_ROLE) returns (uint256 id) {
        if (t.rulesHash == 0 || t.outcomes != 2 || t.openAt < block.timestamp ||
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
    function configurePricePolicy(uint256 id, PricePolicy calldata c) external onlyRole(CREATOR_ROLE) {
        Pool memory p = pool(id);
        if (block.timestamp >= p.terms.openAt || pricePolicies[id].feed != address(0) ||
            c.feed.code.length == 0 || (block.chainid != 31337 && c.sequencer.code.length == 0) ||
            !(c.asset == bytes32("BTC") || c.asset == bytes32("ETH") || c.asset == bytes32("SOL") ||
              c.asset == bytes32("XRP") || c.asset == bytes32("BNB")) ||
            c.maxAge == 0 || c.maxAge > 3600 || c.boundaryTolerance == 0 || c.boundaryTolerance > 300 ||
            c.sigmaPpm == 0 || c.sigmaPpm > UNIT || c.spreadPpm > 100000 || c.impactPpm > UNIT ||
            c.skewPpm > 100000 || c.spreadPpm < c.skewPpm || c.minProbabilityPpm == 0 || c.minProbabilityPpm >= UNIT/2 ||
            c.minSpot == 0 || c.maxSpot <= c.minSpot || IVirtualPriceFeed(c.feed).decimals() > 18) revert Invalid();
        pricePolicies[id] = c; emit PricePolicyFrozen(id, c);
    }
    function _sequencer(PricePolicy memory c) private view {
        if (block.chainid == 31337 && c.sequencer == address(0)) return;
        (,int256 answer,uint256 since,uint256 updated,) = IVirtualPriceFeed(c.sequencer).latestRoundData();
        if (answer != 0 || since == 0 || updated == 0 || updated > block.timestamp ||
            since > block.timestamp || block.timestamp - since <= 3600) revert Stale();
    }
    function _valid(PricePolicy memory c, uint80 round, int256 value, uint256 updated, uint80 answered)
        private view returns (uint128)
    {
        if (round == 0 || answered < round || value <= 0 || uint256(value) < c.minSpot ||
            uint256(value) > c.maxSpot || updated == 0 || updated > block.timestamp) revert Stale();
        return uint128(uint256(value));
    }
    // First round at/after the frozen boundary; no selecting a favourable later observation.
    // Phase-transition/missing predecessor rounds fail closed and ultimately timeout-void.
    function _boundary(PricePolicy memory c, uint80 round, uint64 boundary) private view returns (uint128 value) {
        _sequencer(c);
        (uint80 rid,int256 a,,uint256 at,uint80 answered) = IVirtualPriceFeed(c.feed).getRoundData(round);
        if (rid != round || round <= 1 || at < boundary || at > uint256(boundary) + c.boundaryTolerance) revert Stale();
        (uint80 prev,int256 pa,,uint256 beforeAt,uint80 pans) = IVirtualPriceFeed(c.feed).getRoundData(round - 1);
        if (prev != round - 1 || beforeAt >= boundary || beforeAt >= at) revert Stale();
        _valid(c, prev, pa, beforeAt, pans);
        value = _valid(c, rid, a, at, answered);
    }
    function captureStart(uint256 id, uint80 round) external {
        Pool memory p = pool(id); PricePolicy memory c = pricePolicies[id];
        if (c.feed == address(0) || startPrice[id] != 0 || block.timestamp < p.terms.openAt ||
            block.timestamp > uint256(p.terms.openAt) + c.boundaryTolerance) revert Closed();
        startPrice[id] = _boundary(c, round, p.terms.openAt); startRound[id] = round;
        emit StartPriceCaptured(id, round, startPrice[id]);
    }
    function _sqrt(uint256 a) private pure returns (uint256 x) {
        if (a == 0) return 0; x = a; uint256 y = (x + 1) / 2;
        while (y < x) { x = y; y = (a / y + y) / 2; }
    }
    function probability(uint256 id) public view returns (uint64 upPpm) {
        Pool memory p = pool(id); PricePolicy memory c = pricePolicies[id];
        if (c.feed == address(0) || startPrice[id] == 0 || block.timestamp >= p.terms.closeAt) revert Closed();
        _sequencer(c);
        (uint80 round,int256 value,,uint256 updated,uint80 answered) = IVirtualPriceFeed(c.feed).latestRoundData();
        uint128 spot = _valid(c, round, value, updated, answered);
        if (block.timestamp - updated > c.maxAge) revert Stale();
        int256 delta = (int256(uint256(spot)) - int256(uint256(startPrice[id]))) * int256(UNIT) / int256(uint256(startPrice[id]));
        uint256 distance = uint256(delta < 0 ? -delta : delta);
        // Rational probability approximation, NOT a calibrated normal-CDF claim.
        // ceil sqrt(seconds) prevents downward time rounding from overstating certainty.
        uint256 tau = p.terms.closeAt - block.timestamp;
        uint256 rt = _sqrt(tau); if (rt * rt < tau) ++rt;
        uint256 scale = uint256(c.sigmaPpm) * rt;
        int256 adjustment = int256((UNIT / 2) * distance / (distance + scale));
        int256 prob = int256(UNIT / 2) + (delta < 0 ? -adjustment : adjustment);
        int256 inventory = int256(uint256(p.reserves[1])) - int256(uint256(p.reserves[0]));
        int256 skew = inventory * int256(uint256(c.skewPpm)) / int256(uint256(p.terms.seed));
        int256 cap = int256(uint256(c.skewPpm)); if (skew > cap) skew = cap; if (skew < -cap) skew = -cap;
        prob += skew;
        if (prob < int256(uint256(c.minProbabilityPpm))) prob = int256(uint256(c.minProbabilityPpm));
        if (prob > int256(UNIT - c.minProbabilityPpm)) prob = int256(UNIT - c.minProbabilityPpm);
        return uint64(uint256(prob));
    }
    function _executionPrice(uint256 id, uint8 outcome, uint64 amount, bool buySide) private view returns (uint256 price) {
        uint256 up = probability(id); price = outcome == 0 ? up : UNIT - up;
        PricePolicy memory c = pricePolicies[id];
        uint256 impact = uint256(amount) * c.impactPpm / pool(id).terms.seed;
        uint256 spread = c.spreadPpm + impact;
        if (buySide) { price += spread; if (price >= UNIT) revert Liquidity(); }
        else { if (price <= spread) revert Liquidity(); price -= spread; }
    }
    function _fee(uint256 amount, uint16 bps) private pure returns (uint256) {
        return (amount * bps + 9999) / 10000;
    }
    function _buy(uint256 id, Pool memory p, uint8 outcome, uint64 amount)
        private view returns (Quote memory q, uint64[3] memory r)
    {
        _open(p, outcome);
        if (amount == 0 || amount > p.terms.maxCashIn) revert Invalid();
        uint256 f = _fee(amount, p.terms.feeBps); uint256 net = amount - f;
        uint256 output = net * UNIT / _executionPrice(id, outcome, amount, true);
        if (output == 0 || output > MAX64) revert Liquidity();
        r = p.reserves;
        for (uint8 j; j < 2; ++j) {
            uint256 reserve = uint256(r[j]) + net;
            if (j == outcome) { if (reserve < output) revert Liquidity(); reserve -= output; }
            if (reserve < p.terms.reserveFloor || reserve > MAX64) revert Liquidity(); r[j] = uint64(reserve);
        }
        q = Quote(uint64(output), uint64(f), p.revision);
    }
    function _sell(uint256 id, Pool memory p, uint8 outcome, uint64 amount)
        private view returns (Quote memory q, uint64[3] memory r, uint64 gross)
    {
        _open(p, outcome);
        if (amount == 0 || amount > p.terms.maxSharesIn) revert Invalid();
        uint256 value = uint256(amount) * _executionPrice(id, outcome, amount, false) / UNIT;
        uint256 f = _fee(value, p.terms.feeBps);
        if (value <= f || value > p.collateral || value > MAX64) revert Liquidity();
        r = p.reserves;
        for (uint8 j; j < 2; ++j) {
            uint256 reserve = uint256(r[j]) + (j == outcome ? amount : 0);
            if (reserve < value) revert Liquidity(); reserve -= value;
            if (reserve < p.terms.reserveFloor || reserve > MAX64) revert Liquidity(); r[j] = uint64(reserve);
        }
        gross = uint64(value); q = Quote(uint64(value - f), uint64(f), p.revision);
    }
    function quoteBuy(uint256 id, uint8 outcome, uint64 amount) external view returns (Quote memory q) {
        (q,) = _buy(id, pool(id), outcome, amount);
    }
    function quoteSell(uint256 id, uint8 outcome, uint64 amount) external view returns (Quote memory q) {
        (q,,) = _sell(id, pool(id), outcome, amount);
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
        (Quote memory q, uint64[3] memory r) = _buy(id, before_, outcome, amount);
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
        (Quote memory q, uint64[3] memory r, uint64 gross) = _sell(id, before_, outcome, shares);
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
    function propose(uint256, uint8, bool, bytes32) external pure { revert Invalid(); }
    function proposeFromFeed(uint256 id, uint80 round, bytes32 evidenceHash) external onlyRole(PROPOSER_ROLE) {
        Pool memory p = pool(id); uint256 until = block.timestamp + p.terms.challengePeriod;
        if (p.final_ || proposals[id].exists || startPrice[id] == 0 || block.timestamp < p.terms.resolveAfter ||
            until >= p.terms.resolutionDeadline || evidenceHash == 0) revert Invalid();
        PricePolicy memory c = pricePolicies[id];
        uint128 end = _boundary(c, round, p.terms.closeAt);
        bool voided = end == startPrice[id] && c.tieVoids;
        uint8 winner = end > startPrice[id] ? 0 : 1;
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
        if (positions[id][owner][0].shares == 0 && positions[id][owner][1].shares == 0) return (0, 0);
        if (p.final_) value = claimable(id, owner);
        else {
            uint256 up = probability(id); uint256 sum;
            for (uint8 j; j < 2; ++j) sum += uint256(positions[id][owner][j].shares) * (j == 0 ? up : UNIT - up) / UNIT;
            value = uint128(sum);
        }
        unrealizedPnl = int256(uint256(value)) - int256(basis);
    }
}
