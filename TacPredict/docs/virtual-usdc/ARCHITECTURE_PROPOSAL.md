# Virtual architecture proposal — NOT IMPLEMENTED / NOT APPROVED

All choices in this document are **unverified design proposals (UV)** unless explicitly attributed to inspected source in PHASE1_AUDIT.md. No proposed function or event exists yet.

## 1. Isolated virtual stack

```text
Existing prediction UI (layout unchanged)
  | explicit protocolKind = VIRTUAL_V1 + Virtual USDC label
  v
TanStack virtual API / quote & transaction adapter
  | wallet ownership, exact quantities, policy, stale-data checks
  +--> capability-aware sponsorship broker (off by default)
  +--> explicit user-paid Base transaction fallback
  v
NEW VirtualMarketRegistry + VirtualTradingEngine + VirtualResolver
  | no reference to real-USDC transfer/approval/redemption contracts
  | successful receipt + exact expected event
  v
Provisional transaction tracker -> canonical finalized virtual event indexer
  v
NEW virtual_* Supabase projections / RLS / reconciliation
  +--> Positions / PnL / history / existing UI data adapters
  +--> deterministic monthly scoring -> approval -> TAC Points database ledger

OLD six contracts + UpDownPool + old financial projections: isolated and unchanged
D1 profiles/referrals: metadata only; no grant/balance authority
```

Use a separate deployment identifier, runtime allowlist, ABI and contract-version domain. No address fallback to the old Exchange or Pool. Missing virtual deployment/market/event/projection must return unavailable, not route to real USDC.

## 2. Execution-model decision

| Model | Pricing / depth | Risks / fit |
|---|---|---|
| Virtual CLOB + internal complete sets | Prices come from crossing actual funded virtual orders. Depth is remaining executable orders; no counterparty means no fill; sells can be unavailable. | Good for Polymarket-like orderbooks, but cold start needs genuine makers. A normal atomic fill records Buy and Sell in the same hash, conflicting with a strict separate-transaction-per-side interpretation. Offchain order placement remains only intent. Colluding accounts can transfer economic value through contrived prices. |
| **Bounded onchain virtual prediction AMM (recommended for review)** | User trades against explicitly seeded protocol-owned virtual inventory. Fixed-product outcome-share invariant; reserves determine marginal price, depth, spread/fee and price impact. Binary and three-outcome football require separate validated math cases. | One initiating user Buy OR Sell per transaction. Finite inventory is inspectable onchain and not a promise of real liquidity. New math, solvency, rounding and subsidy limits require implementation/testing/audit. Sells fail when min output, inventory or status constraints fail. |
| Server-signed RFQ / discretionary quote | Server quote + expiry, inventory reservation and onchain checks. | Additional privileged pricing/signing service, censorship and stale/compromised quote risks. Not recommended as first path. |
| LMSR / unlimited virtual dealer | Smooth cost function and a bounded loss parameter in a correct implementation. | Exponent/log fixed-point complexity and subsidy accounting; not a shortcut to infinite liquidity. Not recommended first. |

Recommendation is NOT approval to seed a pool or deploy an AMM. Exact per-market seed, campaign budget, outcome range, fee/spread and size caps need approval first. Initial equal weights are a prior, not verified external odds. BTC spot USD is NOT prediction-share price. Keep existing spot chart design; identify probability/position price as virtual-pool implied and liquidation value as an estimate.

### Finite virtual liquidity, not fake real liquidity
- A protocol-only seed budget creates a fixed, documented allocation of nonredeemable virtual market collateral/inventory. No seed is credited to an admin wallet and no arbitrary user mint is exposed.
- Constructor/campaign limits cap aggregate seeds, per-market seeds, concurrency and issuance schedule; creator role cannot override those caps.
- Seed/fee inventory is excluded from user volume, PnL and points. No owner liquidity-withdraw function.
- User balances, pool reserves, locked market collateral and virtual sinks have explicit conservation equations. Splits/merges internal to the AMM may not create unbacked payout shares.
- No actual seed amount is selected in this phase. If safe seeding cannot be designed within approved limits, Buy/Sell remains disabled. Invented displayed depth is prohibited.

## 3. Candidate contract responsibilities

**VirtualMarketRegistry:** new virtual IDs; canonical metadata/rules/source hashes; outcomes; open/close/resolveAfter/deadline; model version; immutable fee/risk/seed limits; role-gated publish; global/market pause of new trades, not a stealth payout redirect. No writes to old MarketRegistry.

**VirtualTradingEngine:** six-decimal cash by wallet; once-only 500e6 grant; nontransferable internal positions; pool inventory; quote, Buy, Sell and settlement; per-wallet nonces; trade IDs; protocol-domain receipt events. No ERC20/1155 approve/transfer API, native-value intake, bridge, deposit, cash withdrawal or real-token redemption. Reject nonzero msg.value. No arbitrary delegatecall/call target and no admin setBalance/mint-to-user.

**VirtualResolver:** immutable per-market source and challenge terms; separate proposer/arbiter roles; public evidence commitments; eligible challenge workflow; finalization after challenge; permissionless deadline void. Virtual-only challenge bond or rate-limited eligible challenge policy must be selected; never import the old 5-real-USDC bond automatically. Admin login is not resolver authorization. A new 24h default is a conservative proposal, not an approved business rule.

No upgradeable design is assumed; upgrades, if later desired, need a separate governance/delay/migration threat model. Sensitive roles should be separated and controlled by multisig for any future production release.

### Grant eligibility
- Exactly 500_000_000 units per eligible wallet, once across this protocol's lifetime; monthly points cycles do not reset it.
- Authenticated account must prove ownership of the recipient wallet; a curated campaign root/voucher binds chain, engine, campaign, wallet, expiry and eligibility nullifier.
- Claim checks walletGranted AND nullifierConsumed atomically; constant grant amount cannot be supplied by caller/admin.
- Eligibility/root authority cannot edit balances. Root updates require reviewed eligibility evidence, audit and stronger control. A nullifier is only as strong as its issuer; this is not proof of a unique human by itself.
- Old reward/referral balances are not grandfathered into grants. No 100-referral top-up is implemented without a separate approved, onchain policy.

### Candidate storage and events

Storage sketch (not Solidity implementation):
`granted[wallet]`, `usedEligibilityNullifier[hash]`, `balance[wallet]`, `actionNonce[wallet]`, `positions[market][wallet][outcome] {shares,basis}`, `marketCollateral[market]`, `poolInventory[market][outcome]`, `settled[market][wallet]`, immutable campaign limits, pause flags and role assignments.

Candidate interfaces: `claimInitialGrant(proof)`, `quoteBuy(market,outcome,input)`, `quoteSell(market,outcome,shares)`, `buy(...minShares,deadline,expectedRevision,nonce)`, `sell(...minProceeds,deadline,expectedRevision,nonce)`, `settle(market)`. A relayed intent wrapper accepts only these fixed actions, not arbitrary calldata.

Candidate events:
- `VirtualGrantClaimed(wallet,campaign,nullifier,amount,balanceAfter)`
- `VirtualTradeExecuted(tradeId,wallet,market,outcome,side,shares,cashAmount,fee,removedBasis,realizedPnl,balanceAfter,positionSharesAfter,positionBasisAfter,poolRevision)`
- `VirtualPositionUpdated(wallet,market,outcome,shares,basis)` (auxiliary; never a second trade)
- `VirtualMarketResolved/Voided(market,result,evidenceHash)`
- `VirtualPositionSettled(wallet,market,payout,removedBasis,realizedPnl,balanceAfter)`

Market and trade events include enough exact atomic integers to deterministically reproduce projections; emitted values must be checked against state/math, not trusted as arbitrary backend input.

## 4. Exactly one trade per distinct Base transaction

- Signature, quote ID, UserOperation hash, wallet call ID and pending tx hash are **not completed trades**.
- One initiating-user Buy OR Sell per successful L2 transaction receipt. Disable application batching/multicall for trades. Auxiliary position events do not create more trade counts.
- A reentrancy guard alone does NOT block sequential calls inside one smart-wallet transaction. An onchain transaction-wide latch is required, e.g. a never-cleared EIP-1153 transient sentinel shared by all trade entrypoints, plus ordinary reentrancy protection.
- **Blocker:** existing compiler targets Shanghai. Do not change old compiler/artifacts; a separate virtual build target and verified Base EVM support/local simulation are required before adopting TSTORE. This capability is not established in this audit.
- A contract cannot read its current transaction hash; do not invent txHash-based onchain deduplication. Indexer verifies at most one successful VirtualTradeExecuted per transaction; violations quarantine/halt, but backend rejection cannot undo an already mined violation.
- ERC-4337 bundlers can put several UserOperations in one L2 transaction. A global latch would reject subsequent virtual trades in that bundle. Generic sponsorship is therefore NOT assumed compatible. Require verified transaction isolation or use dedicated one-action-per-transaction relay/user-paid fallback.

References: https://eips.ethereum.org/EIPS/eip-4337 ; https://eips.ethereum.org/EIPS/eip-5792 ; https://eips.ethereum.org/EIPS/eip-1153 . These specifications establish semantics, not live provider support.

## 5. Accounting and PnL rules

- Cash, shares and cost basis are unsigned six-decimal atomic integers; PnL is signed. No JS floats in economic writes.
- Buy: debit actual input plus any published virtual fee; add actual shares and acquisition cost including fee to basis. Enforce balance, nonzero output and slippage bounds atomically.
- Partial sell of s out of S: removed basis = floor(B*s/S); if selling all, remove exactly B. Realized PnL = net virtual proceeds minus removed basis. Remaining share/basis state cannot be negative; remainder stays until final disposal.
- Position value estimate = shares times current marginal mark with documented rounding; unrealized PnL = mark value minus remaining basis. Show executable sell quote separately because fees/depth/slippage may differ. A mark is not guaranteed cash-out value.
- Final resolved winning share pays 1 virtual unit; losing share 0. Suggested VOID rule is uniform 1/N per share, not original-cost refund; terms must state it before publication. Aggregate per-owner fractional remainders before flooring and document final subatomic dust sink.
- Settlement burns/zeros internal positions before crediting virtual payout and can happen only once. It cannot pay real USDC or another wallet. Claims remain possible independently of pausing new risk.
- Grants, seeds, referral metadata and points are not trading profit. Any future full-set operation has deterministic cost allocation, conservation and PnL rules; do not silently approximate maker accounting.

## 6. Markets and resolution

Support plan: BTC/ETH/SOL/BNB; 5/15/30/60/720/1440-minute UTC series; football LaLiga/UCL and cricket T20/Bangladesh. This is a target catalogue, not verified feed availability.

Before publication lock: precise product/feed, boundary timestamps, candle field, comparison including equality, stale/missing-data policy, draw/tie/no-result/postponement/abandonment rules, challenge delay, evidence format and timeout payout. Verify BNB instrument availability instead of assuming BNB-USD exists at the selected venue.

APIs/AI produce suggestions only. Creator publishes immutable terms; proposer submits evidence; eligible challengers dispute; independent arbiter resolves; anyone finalizes an unchallenged mature proposal or invokes valid timeout. No ordinary app admin override. Old 24-hour Oracle is not called; choosing a new window needs approval. Five-minute trading duration is not a promise of five-minute final settlement.

## 7. Backend/indexer design

Separate `/api/virtual/*` or matching TanStack server functions: eligibility, grant intent, catalogue, quotes, submit/observe intent, tx status, positions, history, PnL, points, and admin operations. Browser never chooses a confirmed status.

- Server verifies auth + proven wallet + permitted market/outcome/amount, recent quote and projection freshness. Contract repeats all economic checks; server validation is not authority over chain.
- Tx lifecycle: awaiting_signature -> submitted/pending -> included_success (provisional, receipt+exact expected event) -> confirmed_finalized. Alternatives: reverted, replaced, dropped, reorged, invalid_event/quarantined. A receipt without correct engine/wallet/market/side/action nonce/event is not success for this intent.
- Canonical block-hash checks, successful receipt, topic/data/address matching, log order and expected runtime/deployment checks before projection. Receipt timestamps come from canonical blocks, not client time.
- Finalized event primary key `(chain_id,deployment_id,tx_hash,log_index)`; trade unique `(deployment_id,trade_id)` and one trade per tx constraint. Auxiliary logs never add volume again.
- Deployment-scoped fenced lease; compare-and-swap checkpoint only after atomic event+projection application. Bounded RPC ranges/request budget; no silent skipping unknown events or incomplete histories.
- Reorg provisional observations are removed/rebuilt from the last canonical checkpoint. Finalized checkpoint mismatch halts; a reviewed repair journal/snapshot and deterministic replay are required, not an ad-hoc rollback of real CLOB tables.
- Reconcile indexed balances, grants, pool reserves, share balances and cost basis against pinned onchain reads; discrepancies quarantine affected projections and block points snapshots. Do not substitute zero.
- Supabase is query projection. D1 username/referral metadata is not a financial source of truth.

Privacy boundary: wallet balances, actions and events on a public chain are publicly observable. RLS protects application-only identity/eligibility data, not onchain anonymity. Never put personal names, emails or raw identity evidence into events, calldata or nullifiers.
