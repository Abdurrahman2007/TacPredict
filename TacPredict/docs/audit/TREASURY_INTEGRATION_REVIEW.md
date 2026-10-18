# TacPredict treasury, settlement and identity review

Status: engineering review and approval-gated implementation plan; NOT an independent security audit, deployment approval, or public-launch clearance.

## Scope and preservation

- Requested branch `development/base-usdc`: reviewed HEAD `dd2e39d78ac4f16ef63e227334999259ba93bfa4`.
- Supplied `7e33a801791ff844fde6563ac0d036231320785f` and `034a5b39ddf628ebc7ecad211b363336455f6090` are ancestors, not current heads.
- Remote main is `3e90b95c8f3f6b2d0fcdb816d238b95584c41606`; later public UI/chart work there must not be overwritten by this branch. Changes are published only to a separate review branch / draft PR; no merge or deployment is part of this review.
- Legacy dirty checkout preserved; patch and untracked-file archive saved privately outside this worktree. Work proceeds in an isolated worktree.
- Existing six contracts, native USDC, existing Supabase project and public navigation are retained.
- All execution, matching, roles, approvals, production schema changes and signer activation remain blocked without separate explicit approval.

## Read-only finalized-chain checkpoint

At Base block **52764461**, hash `0xc5bde06b5c8ba7830b1148e2f31a0886c95e2528f5b19cfa20e296ebe2fb9529`, timestamp `1792318269`:

- chain ID 8453; native USDC decimals 6;
- all six runtime hashes match the checked-in deployment manifest;
- Registry `tradingPaused = true`, `nextMarketId = 2`;
- Oracle bond `5000000` atomic USDC, immutable challenge period `86400` seconds;
- native USDC balances at each of the six contract addresses: `0` atomic.

This is a checkpoint, not a continuous monitoring guarantee. Runtime-hash equality is not an independent security audit and is not by itself full constructor/bundle verification. Current roles, pointers, compiled runtime and inner-operation deployment proof are verified separately where noted in the evidence report.

## 1. Asset flow BEFORE revenue changes

```text
Wallet / maker -- split amount A USDC --> ConditionalPositions vault
               <-- A shares of EACH outcome --
Vault ledger: collateralLocked[market] += A

Buyer -- executed notional C USDC --> Seller (DIRECTLY, via V1 Exchange)
Buyer <-- outcome shares Q ---------- Seller
V1 Exchange: no fee, no retained trade proceeds; volume is not vault collateral

Complete-set holder -- burn Q of EACH outcome --> Positions
Complete-set holder <-- Q USDC ---------------- Positions

Resolved holder -- burn current shares --> Positions
Resolved holder <-- winning payout ----- Positions
VOID holder     <-- weighted payout ---- Positions

Proposer/disputer -- separate 5-USDC bonds --> Oracle
Eligible bond creditor <-- withdrawBondCredit -- Oracle

Promo ledger: locked 15-USDC account credit (NOT wallet USDC or collateral)
Future rewards: only separately proven funded pool / realized fee allocation
Treasury: only actual earned fees or separately proven legally owned assets
```

### Ledger (all atomic USDC decimal strings; all calculations BigInt/integer)

| Event | Wallet cash movement | Vault liability movement | Protocol revenue |
|---|---|---|---|
| split A | holder -A, Positions +A | +A collateral; equal outcome shares minted | 0 |
| merge A | Positions -A, holder +A | -A collateral; complete set burned | 0 |
| V1 trade C | buyer -C, seller +C | none; shares change owners | 0 |
| resolved claim P | Positions -P, owner +P | -P; corresponding shares burned | 0 |
| VOID claim P | Positions -P, owner +P | -P; equal-weight current shares burned | 0 |
| propose/dispute B | participant -B, Oracle +B | separate bond escrow +B | 0 |
| finalization/timeout bond release | no immediate cash | pending bond reclassified to credit, NOT counted twice | 0 |
| withdraw bond credit B | Oracle -B, creditor +B | bond credit -B | 0 |
| promised promo credit | no on-chain transfer | isolated nonwithdrawable promotional ledger | 0 |
| hypothetical approved V2 trade C, fee F | buyer -(C+F), seller +C, treasury +F | Positions unchanged | F only after canonical fee event/transfer |

Winning liability: sum of outstanding winning shares, not dollar volume. VOID liability uses each holder's aggregated `floor(sum(balance_i * weight_i) / denominator)`; this matches same-holder fractional carry. Cross-holder dust can remain locked; it is NOT withdrawable revenue. Before terminal payout, `collateralLocked` remains reserved; do not add winning liability on top of the same collateral reserve. Oracle pending bonds and credits are separate from Positions collateral and are not counted twice.

### The $80 YES / $40 NO example

Those labels alone are insufficient for a payout or profit calculation. They may represent turnover, quotes, market value or net flow. Fetch shares/supply, ownership, payouts, transfers and collateral at one canonical block.

Illustrative fixture ONLY (not production data): a maker splits `100000000` atomic USDC and sells 100 YES shares for `80000000` and 100 NO shares for `40000000` to two buyers. Volume is `120000000`; vault collateral is `100000000`; maker gross cash receipts are `120000000` and initial cash funding is `100000000`. If YES wins, YES buyer redeems `100000000`; NO pays 0. Maker gross trading P&L is `20000000` before expenses, NOT automatically platform revenue. Vault remainder after claims is 0. VOID pays each buyer `50000000`, not their historical cost. No $40 losing-side sweep exists.

## 2. Existing architecture conclusions

- V1 Exchange is a CLOB, not an AMM. `fillOrder` / `matchOrders` transfer full executed USDC buyer-to-seller. No configurable fee recipient/rate or treasury sweep.
- Positions has no admin sweep. `redeemFor` pays the owner directly. A router cannot deduct an undisclosed payout fee or divert owner redemptions.
- Registry/Factory/Oracle terms and pointers are not upgradeable application proxies. CREATE2 was deployment only. Existing open-market terms and existing signatures must not be rewritten.
- `RESOLVED` and `VOID` are payout terminals. Enum `SETTLED` / `CANCELLED` labels do not create callable admin transitions.
- V1 refunds require actual VOID or permitted after-deadline timeout; no early principal refund. Merges remain available while trading is paused. Claims and bond recovery are not trading activation.
- Oracle evidence hashes are commitments, not proof of external data truth. 24h challenge remains mandatory. Current Coinbase locked templates cannot silently become CoinGecko rules.

## 3. Minimum ADDITIVE fee architecture (PROPOSED, NOT DEPLOYED)

Do not redeploy the existing six contracts. If universal atomic 1% collection is required on new trades, add a separately reviewed **FeeExchangeV2** using the same Registry, Positions and native USDC. Keep old-market redemption/merge/refund paths. V1 direct trades remain fee-free and technically callable; a V1 wrapper cannot enforce a fee across all V1 fills. UI/backend must disclose version, fee and verifying contract; never claim retroactive universal fees.

Proposed economic choices, still requiring owner confirmation:

| Item | Proposal / constraint |
|---|---|
| Requested treasury | `0x57828f1aa32fd6be3988f240068df53ed94b7aef` (public address supplied; receipt/control must be verified before deployment) |
| Rate | requested 100 bps = 1%; proposed hard maximum 100 bps, rate changes for newly signed orders only |
| Payer | **proposed buyer-only surcharge**; seller receives full executed notional; not yet approved |
| Basis | actual executed USDC notional, not price change, stake loss, wallet balance or nominal payout |
| Rounding | cumulative floor per signed BUY order: `feeDelta = floor((priorExecutedNotional + cost)*bps/10000) - floor(priorExecutedNotional*bps/10000)`; reject overflow/zero-invalid fills |
| Quote | disclose notional, fee and total debit separately; buyer's signed all-in budget must cover both |
| Failure/cancel | fee only in same atomic successful settlement; reverted/unfilled/cancelled portion pays 0 |
| Dispute/VOID | proposed execution fee retained because execution occurred; **requires explicit policy approval**; no automatic debit from refund collateral |
| Enforcement | transfer notional buyer->seller and fee buyer->treasury plus shares seller->buyer in one nonReentrant transaction; any leg failure reverts ALL state/transfers |
| Consent | new EIP-712 domain/version/verifying contract and signed fee recipient/rate/all-in limit; do not reinterpret V1 signatures |
| Partial fills | single canonical executed-notional counter per BUY digest shared by fill/match paths; no duplicate fees, including repeated and crossed fills |
| Governance | bounded timelocked future fee/recipient policy controlled by reviewed multisig; existing signed terms cannot worsen; guardian stops new risk only |
| Events | canonical execution ID, marketId, buy/sell digests, buyer/seller, notionalAtomic, feeAtomic, rateBps, treasury; reconcile corresponding USDC transfers |

If later approved, isolate fee proceeds in a fee-only vault for multisig/timelock withdrawals and funded reward allocation; alternatively direct settlement to supplied treasury minimizes custody. These are different designs: direct treasury payments cannot also be described as timelocked vault withdrawals. Do not deploy either until the owner chooses. Any reserve/reward amount already committed must not also be shown as available treasury balance.

## 4. Surplus policy: DISABLED for legacy vault

**Withdrawable Positions surplus is NOT established. There is no callable legacy surplus withdrawal.** After winning/VOID liabilities clear, remaining balance may be sub-atomic dust, donations, another market's collateral, or other people's assets. Accounting residual alone does not grant legal ownership or an execution path. Existing valid users retain indefinite claim rights; do not add expiration to manufacture surplus.

No new contract can safely pull legacy Positions USDC because it has no transfer/allowance/withdraw privilege. Leave any legacy sweep disabled, even if a UI computes a positive residual. A future independently reviewed, opt-in escrow design would need on-chain per-market minted/burned balances, exact claims, segregated assets, explicit rights to donations/dust, liability reserves, disputes/uncertainty locks, bounded withdrawals and events. Such a redesign is beyond the minimum fee add-on and needs separate approval. The user requirement to block on ANY remaining claim/refund/dispute is stricter than solvency alone: both must hold before any future legally authorized surplus transfer.

## 5. Integration audit and safe off-chain hardening

| Area | Existing evidence / gap | Required work |
|---|---|---|
| Deployment | manifests, source records, runtime/role verifier, Base Account inner-operation proof | re-run read-only compiled/constructor/canonical verification; never outer receipt alone |
| Identity | DB migration 009 generates chain-aware IDs; validation currently regex-only | shared uint256 + canonical ID utility; reject wrong-chain/ID mismatch at feed, portfolio and order boundaries; retain chain-bound legacy presentation |
| Creation | prepared metadata, Factory simulation/receipt, finalized MarketCreated indexer | no DB ID allocation; show submitted vs indexed separately; crosscheck question/condition/token hashes |
| Orders | signed EIP-712, ERC1271, nonces, balance/allowance checks | map DB identity against chain; derive/compare seller token on deployed Positions before approvals; re-simulate execution; cancellation/revocation remain available |
| Financial display | execution math BigInt; native feed converts atomic volume/liquidity to Number for generic UI | display conversions must not feed accounting or executable quotes; migrate remaining generic display-only numeric fields separately |
| Claims/refunds | claimable/redeem, native helper, operator timeout | unresolved timeout refund UI preflight currently reads `claimable` before VOID; verify dedicated timeout action first; never mark complete from local submission |
| Indexer | finalized blocks, canonical receipts, ABI decoding, fenced DB jobs/checkpoints | verify actual DB lease/checkpoint/RLS/schema; freeze on reorg mismatch; do not reset production checkpoint |
| Ownership | wallet challenges/SIWE/ERC1271 and verified links | adversarial user A/B tests against actual staging policies; no connected-address shortcut |
| Rewards | promo isolated and source-earned tasks | no new reward balance until separately funded and finalized; no automatic grant from this audit |
| Treasury | existing admin snapshot truthfully unavailable | keep disabled until proven fee deployment/event reconciliation; no fictitious fee/surplus settings |
| Navigation | existing Home/Search/Markets/Rewards/Portfolio surfaces | preserve; no UI restyling in this work |

## 6. Database verification gate (UNVERIFIED live schema)

Repo migrations 004–016 and later 017–020 were inspected as source. The existing project ID remains `lmqaiqvwcytmgwgwyfwx`. **The live project's applied migrations, current RLS/grants, policies, indexer checkpoints, users and balances have NOT been verified in this session.** No Supabase management connection or configured database/server credential is available to this worktree; read-only Base MCP access is separate. Do not equate checked-in SQL or old handoff claims with current production state.

Before any migration: use an authorized read-only admin connection to export migration history (version/name/checksum where stored), information_schema columns and numeric types, pg_policies, pg_proc owner/security-definer/search_path/ACL, pg_class RLS flags, unique constraints, table grants, and indexer checkpoints/job status. Do not export user PII or secrets. Compare desired schema and test grants using anon/userA/userB/service-role in staging. Only then prepare a transactional idempotent additive migration with preflight assertions, duplicate-event unique keys and rollback/roll-forward procedure. No reset, schema replacement, or production migration performed here.

## 7. Required tests BEFORE any deployment / financial mainnet operation

Existing tests are engineering regressions, not independent contract audit.

1. Identity: canonical mainnet/testnet round-trip, legacy with explicit chain, uint256 maximum, >2^53, zero/overflow/Number input, malformed/wrong-chain IDs, mismatched DB/onchain ID. Question/condition/token use abi.encode, not packed. Duplicate mapping rejected by actual DB constraints.
2. Existing EVM: exact split/merge, pause escape paths, partial fills, ERC1271, wrong signature chain/domain, taker restrictions, allowance/balance revocation, invalid order/expiry/nonce, zero price, revert atomicity, seller-price cumulative limits.
3. Claims: winner/loser, multi-outcome VOID with holder carry, cross-holder dust, secondary buyer refund vs historical cost, duplicate claim, user-preserving redeemFor, timeout boundary, dispute blocking finalize, bond release/withdraw once, full 86400-second challenge under deployment parameters.
4. FeeV2 (NOT implemented/tested yet): 1% integer math, cumulative partition invariance, buy/sell payer policy, signed all-in limit, signed recipient/rate, different matching paths, self-trade guards, no fee on revert/unfilled cancel, VOID policy, malicious ERC1155 receiver/reentrancy, max fee/timelock, fee-event vs transfers reconciliation, no bypass claim about V1, fee-free legacy signatures unusable on V2.
5. Solvency: global/per-market reserved balances, holder distribution rounding, other markets and donation balances excluded, unclaimed winners never swept, no duplicate fee withdrawal/reward allocation, all claims/refunds/bonds remain backed. V1 vault surplus withdrawal must remain unavailable.
6. Indexer/DB: finalized receipts incl inner-call success, block-hash/topic/log validation, restart/idempotency, duplicate events, reorg halt/recovery, lease fencing, signed-order versus execution separation, atomic string serialization and large-value round trips, real current RLS isolation tests.
7. Frontend: exact quote+fee+debit, versioned approval target, revocable operator approval acknowledgement, pending/submitted/indexed/failed/void/dispute states, frozen stale quotes, no zero-cent executable order or fabricated source result, promo cannot fund collateral.
8. Operational gates: reviewed testnet E2E across entire lifecycle, failure injection, independent security review, source verification separately, multisig/role/key management, monitoring, legal/compliance assessment, explicit per-transaction approval and bounded launch limits.

## 8. Approval checkpoints

This work does NOT authorize a new contract deployment, role grant, collateral approval/funding, market creation, matching execution, pause changes, source-policy rewrite, financial migration, or activation of any signer. Fee payer/basis display and VOID fee treatment need human confirmation; new fee contract/vault design and timelock/multisig policy need review. Supabase live schema verification remains a prerequisite for DB changes. No launch-readiness claim may be made while these gates remain open.

## 9. Reward funding and implementation boundary

No new reward balances are created. The existing locked promotional credit remains separate. A real future reward campaign requires a proven funding transfer from an approved sponsor/treasury-owned asset or an explicit allocation from fees already collected on-chain. Never allocate future expected fees, losing shares, bond credits or user collateral. Budget, eligibility, per-wallet/user limits, anti-wash-trading policy, schedule and expiry require separate approval.

Keep distinct fields for campaign funding, committed rewards, claimed rewards and uncommitted remaining funding (all atomic strings). Campaign states: draft -> funded -> active -> closed; user states: eligibility evidence -> allocation -> claimable -> submitted -> finalized claimed. An earned task is not itself a funded USDC entitlement. Duplicate allocation and claim keys bind chain/campaign/proven wallet, with verified canonical event provenance. Reject allocations beyond uncommitted funding. Any optional reward escrow must preserve existing claims, prevent replay/reentrancy/double spend, and be separately reviewed; existing promo credit must not be rebranded as that escrow. Fee treasury receipts are not simultaneously available cash and committed reward backing.

## 10. Honest coverage limits

The local patch hardens identity validation at feed/read/portfolio/buy/sell/funding boundaries and checks seller token IDs against the deployed getter. It does NOT complete every integration item in section 5; chain-state/DB hash crosschecks across all endpoints, timeout-refund UX, revoked approvals UX, DB policies, rewards funding and FeeV2 remain review-gated follow-up work. No fee Solidity implementation is claimed from reference-model tests. No public UI redesign is included.

## 11. Validation actually completed

- Exact configured Solidity compilation passed locally. Full tests from application root: **114 passed, 0 failed**, including 8 new identity/reference-accounting tests. Existing local EVM reports 16 scenario groups; its fixture challenge window is 60 seconds, so this does NOT prove mainnet's complete 24-hour operational lifecycle.
- TypeScript typecheck passed. Production build passed locally (no deployment). Baseline test invocation from protocol/ exposed one cwd-dependent chart-test failure; rerunning complete suite from application root passed all 114. Initial incomplete reused dependencies were replaced with an existing complete dependency tree before final validation; no lockfile edits.
- Deployment transaction and receipt were obtained through read-only Base MCP after the public endpoint's historical transaction methods returned HTTP 403. Local proof decoded the exact expected 9 Base Account calls (six compiled CREATE2 creations, two role grants and pause) and verified the admin inner UserOperation success. No outer-status-only success assumption.
- A pinned read-only Base MCP batch verified **25 current pointer, expected-role, pause, counter and oracle immutable checks** at finalized block 52764461. This verifies expected roles, NOT absence of every possible additional role holder.
- The all-in-one HTTP deployment verifier was attempted but did not complete due to read HTTP failures. Full equivalence to that verifier is not claimed: fresh deployment-block canonical-hash/proxy-runtime checks remain to be re-run through a suitable approved read-only endpoint. Runtime hash comparisons and the compiled constructor/inner-operation checks above are distinct successful evidence.
- Current production migration state, RLS enforcement, private-user isolation, fee contract tests, a funded rewards campaign, and real-money E2E are not completed. No fee collection, surplus transfer, new reward credit or live trading was activated.
