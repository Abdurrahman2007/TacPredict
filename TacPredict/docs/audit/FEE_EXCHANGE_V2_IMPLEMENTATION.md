# FeeExchangeV2 — review-only implementation and integration requirements

**Not deployed, activated, independently audited or production-integrated. No transaction or schema change is authorized by this document.** Supersedes the provisional fee-payer/VOID policy in TREASURY_INTEGRATION_REVIEW.md; that file's first checkpoint is historical.

## Confirmed policy and asset flow

The owner confirmed: add 1% to the buyer's actual executed trade notional; pay the seller the full notional; return execution fees to the ORIGINAL BUYER if the market becomes VOID. Execution fee refunds and share/principal payouts are different rights and transactions.

Immediate irrevocable treasury payment and guaranteed VOID refunds are incompatible without a separately funded guarantee. This implementation therefore holds the fee in **FeeExchangeV2's isolated USDC escrow** until the existing Registry's terminal outcome. On final non-VOID RESOLVED it pays the fixed treasury. On VOID it pays original fee payers. It never depends on voluntary treasury repayment. No fee is recorded as earned while open, closed, resolving, disputed, timed out-but-not-VOID, or awaiting finalization.

```text
Successful trade (all legs atomic):
Buyer -- executed notional --> Seller
Buyer -- additional 1% -----> FeeExchangeV2 fee escrow
Seller -- outcome shares ---> Buyer
Positions collateral: UNCHANGED; Oracle bonds: UNCHANGED

Existing Registry -> RESOLVED non-VOID: escrow -> immutable treasury
Existing Registry -> VOID: escrow -> original fee-paying buyers
Existing Settlement: current share holders independently redeem terminal share payouts
```

For 10 USDC notional: buyer debit `10100000`, seller receives `10000000`, fee escrow receives `100000` atomic USDC. Treasury receives the `100000` only after final non-VOID resolution. VOID returns that `100000` to the payer, independently of share ownership or the share redemption amount.

Treasury constructor input intended for separately approved deployment: `0x57828f1aa32fd6be3988f240068df53ed94b7aef`. No V2 address exists in this implementation. No existing address is substituted.

## Exact integer and rounding rules

All quantities use native-USDC/share six-decimal atomic uint256 values. No Number/float financial math.

- Price scale: 1,000,000; strictly 0 < price < scale.
- Fixed rate / hard maximum: **100 bps**. This review version deliberately has NO fee/recipient setter and NO administrator. Changes require a separately reviewed version and fresh consent, not altered outstanding signatures.
- Executed cost uses cumulative seller-order rounding (or the signed direct maker price), matching existing CLOB integer behavior.
- Fee = `floor((scopeNotionalBefore + executedCost) * 100 / 10000) - floor(scopeNotionalBefore * 100 / 10000)` using Solidity Math.mulDiv / TS BigInt.
- Fee scope for any signed BUY order is its EIP-712 digest, shared across direct fills and matching. Direct taker buys against a SELL order use `keccak256(abi.encode("DIRECT_SELL_FILL", sellDigest, buyer))`.
- Partitioning one scope into smaller fills cannot change its total fee. Starting different orders/scopes resets fractional carry; below one atomic unit fees floor to zero, never rounded up or disguised. Tiny separate-order fee avoidance is a disclosed residual risk; a minimum order-notional policy would require separate approval.
- Buyer receives an explicit per-call all-in taker cap. BUY maker signatures also contain `maxTotalCost`, enforced cumulatively across both fill paths. Prior price improvement cannot allow aggregate executed notional above the signed buy price for filled quantity.
- A stale quote can only revert against caps; it cannot authorize extra spending. Quotes must read current filled/notional state before wallet simulation.
- Cancelling unfilled shares never charges a fee; executed portions remain escrowed until the market terminal. Cancellation does not erase historical fee-refund rights.

UI must show separately: **trade amount**, **additional 1% execution fee**, **total USDC debit**, and **fee held pending resolution; refunded on VOID**. Do not call the surcharge an immediately earned treasury balance.

## New signature / ABI boundary

EIP-712 domain: `name=TacPredictFeeExchange`, `version=2`, actual chain ID, and the separately verified V2 verifying-contract address. A V1 signature must not be accepted or reinterpreted.

Order exact field order:

```
uint256 marketId, uint8 outcome, address maker, bool isBuy,
uint256 price, uint256 shares, uint256 nonce, uint64 expiration, address taker,
uint16 feeBps, address feeRecipient, uint256 maxTotalCost
```

Both sides sign rate and recipient. SELL uses maxTotalCost=0; BUY uses a positive total debit cap. Native ERC1271 checks remain supported. V2 nonces/cancellation/fill state are separate from V1; cancellation on one does not cancel orders on the other.

Main methods:
- `fillOrder(Order,bytes,uint256 quantity,uint256 maxBuyerDebit)`
- `matchOrders(Order,bytes,Order,bytes,uint256 quantity)`
- `cancelOrder`, `invalidateNonce`, `orderId`
- `feeFor(scope,cost)`, `directFeeScope(sellId,buyer)`
- `refundableFee(marketId,buyer)`
- `refundExecutionFeeFor(marketId,buyer)` — permissionless helper, recipient FIXED to buyer, cannot redirect; state updated before transfer; rejects zero/double refunds.
- `releasableMarketFees(marketId)`, `releaseMarketFees(marketId)` — only actual RESOLVED non-VOID; recipient FIXED to treasury; rejects double release.

Fee refund does not auto-call timeoutVoid, resolve the market, burn shares or withdraw Oracle bonds. Timeout must first become actual on-chain VOID through the existing allowed deadline path. Existing 24h challenge is not bypassed. Trading pause blocks new risk via Registry, but does not disable terminal fee refunds/releases or existing principal claim/merge paths.

## Accounting, custody and event reconciliation

Per-market/per-payer `feesPaid`, `feesRefunded`; per-market `marketFeeEscrow` and release guard. Global counters:

```
totalFeesCollected = totalFeesRefunded + totalFeesReleased + totalFeeEscrow
nativeUSDC.balanceOf(V2) >= totalFeeEscrow
```

Any donated excess is NOT included in fees or withdrawable. No generic sweep/rescue exists. Positions collateral, unclaimed winning shares, VOID principal obligations, Oracle bonds/credits and locked promotional credits are outside V2's authority.

Two refund ledgers MUST remain distinct:
1. Existing Settlement / PositionRedeemed: current share-holder payout, contract equal weights on VOID, not historical purchase price.
2. V2 ExecutionFeeRefunded: original buyer's actual previously collected surcharge, even if they later transferred/sold all shares.

V2 emits `OrderFilled`, `TradeExecuted`, `ExecutionFeeEscrowed`, `ExecutionFeeRefunded`, `MarketFeesReleased`, cancellations and nonce changes. `ExecutionFeeEscrowed` occurs after successful transfers and immediately before `TradeExecuted` with no intervening external call; a finalized receipt parser must pair these two SAME-CONTRACT events in order, check market/buyer/notional, and check scope equals buy digest or direct scope derived from sell digest + buyer. Multiple executions in a bundled transaction must never be conflated. Use `(chainId, exchangeAddress, txHash, feeEventLogIndex)` as canonical execution key; store trade log index separately. Check matching USDC transfers and outcome-share transfers, canonical block hash and full successful receipt/inner-operation evidence. Hash/address/log order alone is not a substitute for this reconciliation. No backend fee entry from quote/order submission alone.

## Exact remaining integration requirements — NOT activated here

1. **Immutable existing six contracts:** unchanged; do NOT redeploy. FeeV2 constructor only references existing Registry/Positions and fixed treasury. No Factory/Oracle role grant is needed for an Exchange that transfers user-approved shares; do not grant one.
2. **Deployment verification:** if separately approved later, verify chain 8453/native USDC, existing dependency bytecodes/pointers, constructor treasury, compiled V2 runtime, creation receipt + inner account operation, finalized canonical block, signed domain and public source verification. Record V2 as an additional instance, not replacement V1.
3. **Versioned schema:** current source schema has a single exchange address per chain. Before V2 registration, inspect actual live schema. Propose an additive exchange-instance registry keyed by chain/address/version/codehash/finalized creation evidence, and explicit exchange-instance references on order/execution rows; retain V1 routes, signatures, fills and claims. Never overwrite the V1 deployment row as a fake migration to V2.
4. **Fee projections:** append-only indexer-written collected/refunded/released rows; unique chain+contract+tx+log keys, exact numeric(78,0) amounts exposed as strings; payer-specific ownership-bound refund reads; separate earned/pending/refunded/donation/promo accounting; no anonymous/authenticated write grants. Claiming a fee twice must be blocked by contract AND replay-safe indexing.
5. **Indexer:** separately allowlist verified V2 address + ABI without discarding V1; add all fee events, reconcile against transfers and on-chain fee counters at one canonical finalized checkpoint; scope logs/checkpoints per deployment. Unknown financial events halt; replay, reorg, duplicate, partial transaction and stale DB cases must fail safely. No production indexer/config modification is included here.
6. **Backend:** new strict V2 signed-order parser/domain, approved deployment/version selection, exact total-debit checks and wallet ownership proof, runtime dependency verification, current balances/allowances/nonces and execution simulation. V1 stays fee-free; do not advertise 1% on every possible V1 direct fill.
7. **Frontend:** explicitly choose V1/V2 with clear fee disclosure. Buyer approves USDC to V2 for reviewed all-in debit; seller separately acknowledges/revokes Positions operator approval for V2. Never reuse an old spender approval or silently approve unlimited collateral. Distinguish share payout vs fee refund and their separate submitted/indexed/failed states. Do not mark refunded from a button click.
8. **Rewards:** no rewards backed by refundable fees. Only actually RELEASED non-VOID fees or a separately proven funded sponsor pool can fund a campaign; no rebranding of the locked $15 promo balance. Reward allocation/rates/limits still require approved policy and implementation.
9. **Surplus:** legacy sweep remains disabled and unimplemented. Fee release is earned fees only, NOT a surplus transfer. A residual accounting balance gives no legal/contractual ownership or withdrawal authority.
10. **Operational approval:** independent review, actual staging/testnet E2E, RLS/migration checks and reviewed budgets/treasury custody before any deployment approval request. No mainnet approval is requested by this report.

## Supabase verification: what was and was NOT proven

Existing project ref `lmqaiqvwcytmgwgwyfwx`, existing local public application key, GET only, `limit=0`; no user rows retrieved, no SQL writes. Observations are in `SUPABASE_PUBLIC_EXPOSURE_CHECK.json`:

- Anonymous zero-row reads returned HTTP 200 for deployments, markets, trades (public read surfaces).
- HTTP 401 for orders, positions, claims, refunds, audit logs, job leases and indexer checkpoints.

These results do NOT prove live migration history, all policies/grants, security-definer function behavior, authenticated user A/B isolation, service-role boundaries or actual checkpoint freshness. An empty / limited query is not proof that a policy is correct. **Full live schema/RLS verification is blocked by missing authorized management/database access.** No Supabase integration is connected in this session; available .env has only URL/public key, no database/service credential. Do not request service-role/password secrets in chat.

Read-only diagnostics are supplied in `sql/supabase-read-only-verification.sql`, outside the migration directory. Run via an authorized existing-project SQL/admin read-only connection, export metadata only, then compare applied migrations, numeric columns, constraints, actual pg_policies, grants, RLS flags, function owners/ACL/search_path, and canonical checkpoints. User A/B enforcement tests require isolated staging identities/proven wallets and approved fixture funding/transactions as applicable; cannot be asserted from anonymous production reads. No production mutation probe or schema migration was performed.

## Concurrent implementation conflict

At inspection: main `4c16eb7e14dd1d187c9bef3055d215caae075d05`, development `47fa8f98a0a844deaba6d136fb77fdc884503b86`. They contain a separate `UpDownPool.sol` parimutuel system. Its source fee is taken from the losing pool and has owner-fee/dust bookkeeping; that is NOT the newly approved additional-buyer CLOB fee policy. Its keeper/admin/UI are not connected to this FeeV2. No claim is made that this separate pool is deployed or independently audited. Do not merge them or activate either under the other's economics. Review branch remains based on the earlier audited V1 integration plus identity guards; preserve newer UI work during any later reviewed merge.

## Residual risks / honest status

- Prototype only; not a completed independent security audit. More adversarial fuzz/property, bundled receipt/indexer, external token/freeze behavior, staging database isolation and end-to-end integration review remain mandatory.
- Registry is a bonded trusted-resolver beta: terminal truth still depends on its existing proposer/dispute/arbiter process, not automatic proof of API truth.
- V1 cannot be forced to charge V2 fees. Direct V1 fills remain technically possible.
- Native USDC issuer freeze/pause/blacklist and RPC/provider liveness can delay transfers. Failed transfers revert counters; there is no dishonest success status or alternate unsupported token.
- Immutable treasury/rate deliberately reduce privileged power but do not provide lost-key recovery or dynamic governance. Choose treasury custody/multisig and fee governance before approval; changing these is a reviewed source change.
- Dust donations to V2 are intentionally inaccessible, not owner revenue. Tiny new fee scopes can each round fractional fees down.
- Existing V1 principal VOID payout remains equal-weight share redemption, not purchase-price refund. Only collected execution fees are refunded in full on VOID.

## Local validation checkpoint (review branch only)

- Full regression from application root: **129/129 runner tests passed**, zero failed/skipped; includes the new 15-case suite and existing protocol/integration tests.
- New FeeExchangeV2 suite: **15/15 passed**, including buyer surcharge, cumulative rounding, signature/domain/recipient consent, partial fills across both paths, approvals/caps/rollback, ERC1271, rejecting share receiver and reentrancy, cancellation/nonces/pause, real 24-hour dispute/challenge, non-VOID one-time release, original-buyer VOID refund after share transfer, independent multi-buyer timeout refunds, and global accounting.
- Solidity 0.8.30 / optimizer 200 / viaIR / Shanghai compilation passed; FeeExchangeV2 deployed runtime size **11,216 bytes** (compiled locally, NOT deployed). Existing six contract source files are unchanged.
- TypeScript `tsc --noEmit`, production application build and targeted ESLint passed. Build-generated route-order changes are deliberately excluded.
- Reproduce the isolated suite: `cd protocol && npm run test:fee-v2`; full regression from application root: `node --test protocol/test/*.test.mjs`. Test deployments/keys/tokens are local Ganache fixtures only, not real-chain assets.
- Ganache emitted a Node 24 native µWS compatibility warning and used its JavaScript fallback; this was not a test failure.
- Not performed: live V2 deployment/transactions, live migrations, full live RLS/user-isolation verification, production fee indexing, staging wallet E2E, independent audit or external freeze/fuzz campaigns. These remain release gates.

## Read-only security follow-up

See [Supabase security follow-up](SUPABASE_SECURITY_FOLLOWUP.md) for fresh zero-row endpoint checks, all-public-table metadata diagnostics, repository migration/function expectations, ownership/indexer source findings and sports binding-name evidence. **Live migration history/RLS verification remains blocked** because no authorized project metadata session/results were obtained. Newly identified source issues include permissive alternate `users`/`wallets` policies, missing explicit `verified_at` in raw ownership reads, a broader legacy orderbook view, and missing-market financial-event acknowledgement. None was fixed or mutation-tested in production. Trading must not be activated on the strength of prior local fee tests.
