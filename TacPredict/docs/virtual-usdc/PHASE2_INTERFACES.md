# Phase 2 — proposed interfaces, storage and service boundaries

**UV / REVIEW ONLY.** Pseudocode for review, not compiled Solidity and not permission to implement. See [AMM spec](PHASE2_AMM_SPEC.md). No new `.sol`, application execution code or migration is created by this phase.

## 1. Proposed contract responsibilities

| New contract | Responsibility | Forbidden |
|---|---|---|
| VirtualMarketRegistry | Immutable terms hashes, ordered outcomes, timing, approved template and resolution references | Real Factory calls, editing active economics, arbitrary seed input |
| VirtualTradingEngine | Fixed grants, cash, seed accounting, reserves, Buy/Sell, cost basis, settlement | ERC20/1155 transfers/approvals, arbitrary credit, real collateral, withdrawals |
| VirtualResolution | Proposals, evidence, challenge deadline, adjudication and immutable final result | Old Oracle bond, admin login bypass, AI/API auto-finality |

Prefer non-upgradeable pilot contracts with fixed component addresses. Upgrades/migration require separate user approval and a position-preservation design; no hidden proxy admin. Constructor/cross-reference ordering must be solved explicitly (precomputed addresses or a one-time, verified bootstrap before any grants/seeds); no permanently mutable dependency setter. No deployment now.

## 2. Interface sketch

```solidity
// Design notation only: selected fields, not a complete compilable ABI.
interface IVirtualTradingEngine {
    enum Side { Buy, Sell }
    struct TradeRequest {
        address wallet;
        uint256 marketId;
        uint8 outcome;
        Side side;
        uint64 amountIn;       // Buy gross cash OR Sell owned shares
        uint64 minAmountOut;   // Buy shares OR Sell net cash
        uint64 expectedRevision;
        uint64 deadline;
        uint256 actionNonce;   // wallet-scoped, used by BOTH direct and relayed execution
    }
    struct Quote {
        uint64 input;
        uint64 output;
        uint64 fee;
        uint64 revision;
        uint64 maxExecutableInput;
        uint8 failureReason;
    }
    struct GrantProof {
        bytes32 campaignId;
        bytes32 nullifier;
        uint64 expiry;
        bytes eligibilitySignature;
    }
    function claimInitialGrant(GrantProof calldata proof) external;
    function activateMarket(uint256 marketId) external; // authorized, immutable approved seed template
    function quoteBuy(uint256 marketId, uint8 outcome, uint64 grossCash) external view returns (Quote memory);
    function quoteSell(uint256 marketId, uint8 outcome, uint64 shares) external view returns (Quote memory);
    function buy(TradeRequest calldata request) external;  // request.wallet == msg.sender; side == Buy
    function sell(TradeRequest calldata request) external; // request.wallet == msg.sender; side == Sell
    function executeIntent(TradeRequest calldata request, bytes calldata signature) external;
    function settleFor(address owner, uint256 marketId) external;
    function pauseTrading() external;
    function resumeTrading() external;
    function cashOf(address wallet) external view returns (uint128);
    function positionOf(address wallet, uint256 marketId, uint8 outcome)
        external view returns (uint64 quantity, uint128 basis, int256 realizedPnl);
    function nextActionNonce(address wallet) external view returns (uint256);
}
interface IVirtualMarketRegistry {
    // Full immutable terms also include source, tie/void policy, dispute deadline,
    // price/quantity/risk bounds, template/version and content-addressed rules.
    function createPreparedMarket(bytes32 termsHash, bytes calldata canonicalTerms) external returns (uint256);
    function marketTermsHash(uint256 marketId) external view returns (bytes32);
}
interface IVirtualResolution {
    function propose(uint256 marketId, uint8 outcome, bool isVoid, bytes32 evidenceHash) external;
    function challenge(uint256 marketId, bytes32 evidenceHash) external;
    function adjudicate(uint256 marketId, uint8 outcome, bool isVoid, bytes32 evidenceHash) external;
    function finalize(uint256 marketId) external;
    function finalizeTimeoutVoid(uint256 marketId) external;
    function finalResult(uint256 marketId) external view returns (bool final_, bool isVoid, uint8 outcome);
}
```

`finalizeTimeoutVoid` can act only under a precommitted timeout condition, not arbitrary operator preference. `adjudicate` cannot skip challenge timing; finalization requires actual configured authority/quorum. Any optional challenged virtual bond requires a separate escrow specification before addition. Normal public finalization after undisputed expiry can be permissionless. All economic amounts, limits and durations are immutable per published market; full ABI must expose them, not just a hash.

Direct calls and relayed intents consume the same economic-wallet nonce. Nonces must be unique across all Buy/Sell entrypoints. EIP-712 domain binds chain ID, fixed engine, version; signed request binds every field including side/deadline/min output. EOAs recover signatures; ERC-1271 wallets use restricted static signature checking. No arbitrary target/value/calldata forwarding. Grants have separate nullifier and lifetime claimed state, not the trade nonce. Invalid grants cannot be re-enabled by changing campaign ID.

Proposed explicit errors: `AlreadyGranted`, `Ineligible`, `Expired`, `InvalidNonce`, `WrongWallet`, `WrongOutcome`, `Closed`, `TradingPaused`, `StaleRevision`, `InsufficientVirtualCash`, `InsufficientShares`, `InsufficientLiquidity`, `SlippageExceeded`, `NumericBound`, `TradeAlreadyInTransaction`, `NotFinal`, `AlreadySettled`, `Unauthorized`. Revert messages are not balance projections.

## 3. Storage map (logical, not final slot packing)

| Owner | Key / storage | Guard |
|---|---|---|
| Engine | immutable registry/resolver, chain/domain/model version, approved grant/seed hard caps | Cannot change after bootstrap |
| Engine | wallet -> cash `uint128`, lifetime granted bool, next trade nonce `uint256` | Only grant/trade/settlement transitions |
| Engine | eligibility nullifier -> used bool | Campaign-bound attestation, wallet-bound, one use |
| Engine | market -> collateral, seed consumed, 3 reserves, revision, activation flag, bounds/template reference | Positive reserve and total issuance checks |
| Engine | wallet/market/outcome -> Q `uint64`, basis `uint128`, realized `int256` | No shorting, checked wide arithmetic |
| Engine | wallet/market -> settled flag | Terminal final result; one owner payout |
| Engine | issued grants/seeds, fee sink, terminal pool sink, outstanding collateral/dust | Conservation invariants |
| Registry | marketId -> frozen canonical terms + terms hash / approved series template | Freeze before seed/positions |
| Resolver | market -> proposal, evidence hashes, proposer, deadlines, challenge, final result | State-machine authority, no result change after final |
| Engine transient | one fixed TSTORE trade-used slot | Set once for any successful Buy/Sell; NEVER clear during transaction |
| All | separate role memberships and trading-only pause state where relevant | Least privilege, no general external-call executor |

Reserve revision increments with every reserve-changing trade and when final/pause state affects quote execution. Quote cannot be reused across an engine, market, wallet or side. Use Solidity full-precision helpers where products of quantity and basis require them; bounded reserves alone do not bound every intermediate.

## 4. Events — proposed authoritative accounting inputs

```solidity
event InitialGrant(address indexed wallet, bytes32 indexed campaignId, bytes32 nullifier, uint128 amount);
event MarketSeeded(uint256 indexed marketId, bytes32 indexed termsHash, uint64 seed, uint64 revision);
event TradeExecuted(
    address indexed wallet, uint256 indexed marketId, uint256 indexed actionNonce,
    uint8 outcome, uint8 side, uint64 amountIn, uint64 amountOut,
    uint64 fee, uint64 revision, int256 realizedPnlDelta
);
event PositionUpdated(address indexed wallet, uint256 indexed marketId, uint8 outcome,
    uint64 quantity, uint128 remainingBasis, int256 cumulativeRealizedPnl);
event PositionSettled(address indexed wallet, uint256 indexed marketId,
    uint128 payout, int256 realizedPnlDelta, bool isVoid);
event ResolutionProposed(uint256 indexed marketId, address indexed proposer,
    uint8 outcome, bool isVoid, bytes32 evidenceHash, uint64 challengeUntil);
event ResolutionChallenged(uint256 indexed marketId, address indexed challenger, bytes32 evidenceHash);
event ResolutionFinalized(uint256 indexed marketId, uint8 outcome, bool isVoid, bytes32 evidenceHash);
// Also: market creation/terms lock, role changes, pause/resume and budget consumption events.
```

One `TradeExecuted` per successful L2 transaction across the canonical engine; additional PositionUpdated/fee/claim events are not separate trades. Chain ID/contract/block/hash/log index come from verified receipt metadata, not trusted API fields. Realized PnL is auditable against net cash and removed basis; unrealized PnL is a block-pinned read, not a fake continuously authoritative event.

## 5. Exact distinct-transaction requirement

A normal reentrancy guard resets on exit and does **not** block two sequential trades in a smart-wallet multicall. Propose an EIP-1153 transient latch shared by every trade entrypoint, set once and never cleared until transaction ends. Reverts roll back state: only successful trades count. EVM contracts cannot read their own transaction hash; do not pretend `mapping(txHash)` enforces uniqueness.

- Test same wallet/different wallets, same/different markets, Buy+Buy, Buy+Sell, Sell+Sell, wallet batches and relay calls. No batch-trade endpoint.
- One L2 transaction may include multiple non-trade operations, but cannot confirm two successful virtual trades.
- An ERC-4337 bundle may include multiple UserOperations. A successful outer receipt does not prove a specific operation or expected event succeeded. Provider must isolate one trade per L2 transaction; second trade in a bundle reverts. If isolation is unsupported, reject that sponsorship route and offer approved direct/relay fallback.
- One trade per Base **L2** transaction does not mean one trade per L1 batch.

Official OP Ecotone specification includes EIP-1153, but the existing compiler uses Shanghai [SV]. New virtual build must explicitly target the verified compatible EVM without changing the old six artifacts. A read-only official Base RPC probe returned HTTP 403 **before chain ID**; no runtime/opcode compatibility was production-verified. Local fork and Base Sepolia probes remain gates. No deployment or transaction was attempted.

## 6. Backend/API contracts (proposed)

Use TanStack server functions/current Cloudflare stack behind `/api/virtual/v1/*` endpoints as needed; do not migrate frameworks. GETs can be cacheable only with deployment/block/revision keys; wallet mutations require existing nonce-verified wallet authentication and authorization.

| Endpoint | Purpose / constraint |
|---|---|
| GET `/config` | Public version/chain/engine/caps/disabled status, never secrets |
| GET `/markets`, `/markets/:id` | Virtual catalogue only; frozen terms/source/resolution/status |
| POST `/quotes` | Wallet/market/outcome/side/exact-input; canonical block, bounds, fee, min-output guidance |
| GET `/eligibility/me` | Reason/claim status for authenticated owner; no balance creation |
| POST `/grants/authorization` | Approved eligibility attestation after idempotent checks; not a grant itself |
| POST `/trades/prepare` | Validate auth/eligibility/market, simulate exact method, return calldata + gas route |
| POST `/trades/submit-sponsored` | Restricted signed intent and budget reservation; returns pending ID/hash, NEVER confirmed |
| POST `/transactions/observe` | Verify submitted hash, exact deployment/owner/nonce/event; rejects arbitrary hash attribution |
| GET `/transactions/:hash` | Pending/included/finalized/reverted/reorged/replaced/dropped + canonical proof |
| GET `/portfolio/me`, `/positions/me`, `/trades/me`, `/pnl/me` | Owner-scoped projections and freshness; no legacy balance mixing |
| GET `/markets/:id/history`, `/depth` | Derived AMM probability history and simulated executable sizes, not invented CLOB offers |
| GET `/points/me`, `/points/formula/:month` | Versioned finalized inputs/allocation/exclusions; points separate from cash |
| `/admin/*` | Read, draft, approve and audit operations under the permission matrix, no implicit contract authority |

Quote and prepare repeat server-side outcome/quantity/balance/price/status checks, but engine is authoritative at execution. Do not trust client amounts, “success”, cached quotes or database credits. State races revert safely; no alternate offchain trade completion.

### Transaction state and indexer

`AwaitingSignature -> Submitted/Pending -> IncludedSuccess (provisional) -> Finalized`. Other terminal/exception states: rejected, reverted, dropped/replaced, reorged, invalid/missing event. Only successful receipt **plus** decoded exact trusted event confirms inclusion; show provisional versus finalized clearly. Points use finalized only. A hash, API response or UserOperation receipt alone is insufficient.

Group whole receipt logs before applying a trade: exactly one matching engine TradeExecuted, with wallet/actionNonce/market/outcome/side/inputs matching the intended action. Any zero/multiple/untrusted match fails closed and alerts. Do not apply the first log and later discover a second trade.

Event ID `(chainId,deploymentId,txHash,logIndex)`, unique trade transaction `(chainId,deploymentId,txHash)`, unique wallet action `(deploymentId,wallet,actionNonce)`. Leases/checkpoints are deployment-scoped. Apply decoded event, projection updates and checkpoint in one fenced DB transaction. Preserve block/parent/hash/canonical status, receipt and verifier version.

Maintain provisional journal for rollback; reorged events undo/replay projections deterministically. Finalized checkpoint mismatch halts for investigation; no silent “reset to latest” or reward republishing. Reconcile onchain cash/positions/reserves/nonce against projections at the same finalized block. Missing events, RPC gaps or unknown deployment disable dependent confirmations/points. An observed RPC balance is not permission to synthesize a missing TradeExecuted.

### Additive migration design — NOT created or run

Draft tables: `virtual_deployments`, `virtual_markets`, `virtual_grant_authorizations`, `virtual_grants`, `virtual_transactions`, `virtual_chain_events`, `virtual_positions`, `virtual_cash_projections`, `virtual_resolution_events`, `virtual_indexer_checkpoints`, `virtual_indexer_leases`, `virtual_points_formula_versions`, `virtual_points_snapshots`, `virtual_points_allocations`, `virtual_activity_flags`, `virtual_sponsor_reservations`, `virtual_admin_audit`.

Keep accounts/referral metadata outside financial truth. No anonymous writes, no client balance setters. RLS binds user rows to verified economic wallet owner; public market/ranking views whitelist nonsensitive fields. Admin reads require assigned app role + AAL2; service mutations use narrow RPCs, unique constraints and lease fences. Separate audit entries for application approvals versus mined onchain actions. Do not use a client-supplied admin flag. Private eligibility evidence/signing payloads have retention/redaction rules. Database immutability is operational, not a cryptographic guarantee against a privileged database owner; optional digest anchoring requires approval.

## 7. Admin permission matrix

| Action | App access | Additional authority |
|---|---|---|
| Metrics, users, balances/positions/flags | Scoped analyst/admin + AAL2 | Read only, freshness/finality badges |
| Draft market / preview | Market editor | No onchain effect |
| Publish/seed within approved template | Publisher + AAL2 | Separate onchain creator/seed role wallet; immutable budget checks |
| Grant attestation | Eligibility service/reviewer | Approved policy/nullifier, no arbitrary amount |
| Stop new virtual trading | Guardian | New engine role only; reason/audit, not old contracts |
| Resume new virtual trading | Stronger governance/multisig | Explicit approved action, never automatic |
| Propose result | Resolver operator | New onchain proposer role + evidence |
| Challenge/adjudicate | Watcher / independent adjudicator as approved | Actual resolver roles and fixed window; app admin cannot bypass |
| Finalize / settleFor | Public or approved operator | State-machine guards; proceeds always owner |
| Points formula future version | Rewards editor drafts; separate approver | Frozen before period; budget approval and snapshot digest |
| Final points publication | Rewards approver | Reconciliation/exclusion review, one publication ID |
| Sponsor enable/limits | Gas operator within immutable service constraints | Separate budget approval; emergency disable independent of trading |
| Edit balance / withdraw / overwrite result | **No role** | No such function |

Screens: Virtual Overview, Virtual Markets, Eligibility/Users, Resolution, TAC Points, Gas Operations, Audit. Reuse clean admin shell with explicit “Virtual” badges, confirmed vs pending metrics and no real treasury collateral card masquerading as virtual balances. Existing app admin permissions never imply contract roles. Sensitive governance should use a multisig with separation of publisher, resolver, rewards and sponsorship controls.

## 8. Gas sponsorship and fallback design

1. Investigate Base-compatible smart-account/paymaster provider capability for **one trade per distinct L2 transaction**, sender identity, supported connector, receipt/event visibility and costs. Capability is unverified; no provider selected or configured.
2. If it cannot guarantee isolation, propose a dedicated EOA relayer submitting exactly one signed engine intent per transaction. The relayer cannot credit balances or forward arbitrary calls; engine verifies the wallet signature, domain, nonce, deadline and bounds. No key in frontend/logs. Production key creation, funding or secret changes are separate approvals.
3. Otherwise request a direct user-paid call from the **same economic wallet**, after showing a current estimate including Base fee components when available. Do not switch smart-account holdings to its owner EOA. Wallet rejection is not permission for an automatic alternative transaction.
4. Without sponsorship or sufficient native ETH, no trade executes. Explain the blocker; do not credit an API-only position.

Per-wallet/global/day limits, permitted selectors/engine/chain, zero attached ETH, maximum request size/gas/fee, eligibility/rate controls, idempotent reservations, pending exposure and reconciliation of actual receipt costs. Reserve maximum estimated liability atomically before broadcast; release/reconcile only after canonical outcome. Timeout after broadcast is **unknown**, not failed: reconcile nonce/hash before retry/fallback. Direct and relayed calls share the same action nonce to prevent duplicate economic execution (a losing duplicate may still burn gas). Track estimates versus actual costs and service markups; provider cost is not assumed zero or always cheaper than direct gas. Emergency sponsorship off must not pause direct trading or change balances.

## References

- Source snapshot: `src/components/prediction-amount-card.tsx`, `src/lib/protocol/execution.ts`, `protocol/scripts/compile.mjs` at the audited commits.
- EIP-1153: https://eips.ethereum.org/EIPS/eip-1153
- OP Ecotone: https://specs.optimism.io/protocol/ecotone/overview.html
- ERC-4337: https://eips.ethereum.org/EIPS/eip-4337
- ERC-5792: https://eips.ethereum.org/EIPS/eip-5792

Specifications support design reasoning, not proof that a configured provider, wallet or production runtime satisfies it.
