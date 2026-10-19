> **Newer continuation:** [Stage 2 launch-gate implementation and fresh read-only observations](REMAINING_LAUNCH_GATES_STAGE2.md). Historical limitations below must be read with that report; production changes remain unapplied.

# Authenticated live Supabase verification and review-only fixes

**Verdict: release remains BLOCKED. Live catalog verification completed; code fixes and SQL proposals are not deployed/applied. Draft PR #3 remains open/draft/unmerged.**

## What was actually inspected

Existing project `lmqaiqvwcytmgwgwyfwx`, authenticated dashboard, production `main` database. Three explicit `BEGIN TRANSACTION READ ONLY` catalog inspections returned successfully, with `transactionReadOnly=on`, role `postgres`. No application RPCs, user/account rows, balances, orders, event payloads, auth identities, secrets, or signing material were retrieved. No DDL, DML, migration, deployment, policy edit, checkpoint write, mainnet transaction or trading activation occurred.

Reproducible executed statements and compact evidence:
- [Connection preflight](sql/supabase-live-preflight.sql)
- [Executed aggregated catalog query](sql/supabase-live-catalog-executed.sql)
- [Boolean-only predicate checks](sql/supabase-live-predicate-flags.sql)
- [Catalog metadata, timestamps, raw-response SHA256 and function comparison](SUPABASE_LIVE_METADATA_VERIFICATION.json)

The read-only statement ran as a privileged inspector, not an impersonated end user. Catalog policy/grant verification is distinct from production user A/B runtime testing. No production user identities were changed to simulate those tests.

## Verified production findings

| Surface | Verified result | Interpretation |
|---|---|---|
| Applied migration ledger | `to_regclass('supabase_migrations.schema_migrations')` returned NULL; schema absent from inspected catalog | Applied migration versions **cannot be verified**. Do not bootstrap or falsify a ledger and do not replay all repository migrations. |
| Public relations | 37 ordinary tables, 2 views; all 37 tables RLS-enabled | RLS enabled does not mean policies are safe. Views need separate ownership/invoker/grant review. |
| Native financial/private table API writes | Effective anon/authenticated INSERT, UPDATE, DELETE and TRUNCATE denied for native protocol tables | Positive catalog finding; not a blanket proof that every privileged RPC or writer is safe. Service role retains its intended trusted-writer boundary. |
| Alternate `users` / `wallets` | Public SELECT policies; anon/authenticated INSERT lowercase-only checks, UPDATE USING true; effective write grants including DELETE/TRUNCATE | **Confirmed HIGH integrity/privacy weakness.** DELETE lacks a matching RLS policy, but granted TRUNCATE is outside RLS when a SQL-capable role can invoke it. No live write or REST truncate exploit was attempted. These are not native collateral balances. |
| Wallet-linked private records | Positions/claims/refunds and wallet SELECT policies enforce `auth.uid()` binding but omit `verified_at`; portfolio body also omits it | Confirmed defense-in-depth gap, not proof of active wallet theft. Live binding invariants were not queried. |
| Public orderbook | Owner postgres, security_barrier=true, no security_invoker; no zero-taker predicate or verified/trading-enabled deployment predicate | Confirmed legacy exposure broader than signed-order RPC. Advisor also reports security-definer view. No signatures or user rows were exported. |
| Atomic event projection | Live event-function hash exactly matches reviewed migration 011; boolean check confirms missing parent returns success | Confirmed fail-open source is deployed. Historical event loss is **not established** without reconciliation. |
| Roles/schema | anon/authenticated do not BYPASSRLS and cannot CREATE in public/auth; service_role and postgres bypass RLS | Expected privileged boundary. Secret custody and deployed writer provenance remain essential. |
| Default ACLs | postgres/supabase_admin public-object defaults grant API roles broad rights | Future-object exposure risk. Existing native explicit revokes work, but defaults must not be relied upon as safe. |
| Function fingerprints | Of 36 expected source functions: 28 exact body matches, 7 mismatches, 1 missing (`get_user_reward_tasks`); live has 36 routines, including `rls_auto_enable` | Exact body matches are not an independent audit or migration-history proof. Seven mismatches need semantic owner review; they include legacy account/reward/admin-import routines. |
| Native RPC access | Event apply / leased writes / wallet-proof consumption are not executable by anon/authenticated; portfolio authenticated only; signed-orderbook intentionally public | Positive metadata findings. Original unfenced service-role apply RPC still exists; RLS does not constrain a service key. |

All table/role/policy/grant comparisons are in the evidence JSON. No anonymous write probes or real-wallet claims were used.

## Fixes implemented in the review branch (NOT production)

### 1. Stop unverified browser wallet writes

`src/hooks/use-wallet-sync.ts` no longer writes legacy telemetry on connect. Disconnect cache invalidation remains. `syncConnectedWallet()` is retained as a compatibility-safe disabled entry point with no Supabase/network dependency. Connecting an address is not proof of ownership; the existing authenticated SIWE/ERC-1271 native wallet-link path remains the ownership mechanism. No replacement tables, accounts or fake balances are created.

### 2. Access-hardening SQL proposal

[security-access-hardening.sql](proposals/security-access-hardening.sql), deliberately **outside `supabase/migrations`**:
- Revokes table and independently granted column privileges on alternate users/wallets and legacy orderbook; drops the permissive telemetry policies without deleting data.
- Retires API access to legacy orderbook and enables security_invoker; no current reviewed repository consumer uses that view. Signed-orderbook RPC is retained. External compatibility must be checked before approval.
- Preserves SELECT-only market metrics and removes its unnecessary write grants.
- Adds restrictive verified-wallet gates for wallets, positions, claims, refunds and own orders; also adds verified_at inside the invoker portfolio RPC.
- Hardens **postgres-owned** future public table/sequence/function default grants. Global PUBLIC EXECUTE on future postgres-owned functions must also be revoked because PostgreSQL per-schema revokes cannot cancel a global default. This affects future postgres functions across schemas and requires explicit review. Supabase-managed owner's defaults are not silently changed; every new object still needs explicit ACL review.
- Contains an exact live portfolio-body hash precondition; drift aborts instead of overwriting unknown code.

This is a proposal, not a silently queued production migration. It does not replace server-side proof validation or audit every legacy reward/admin routine.

### 3. Atomic indexer SQL proposal

[indexer-atomic-projection-guard.sql](proposals/indexer-atomic-projection-guard.sql), also outside migrations:
- Validates positive bounded market IDs and locks exact chain-bound market/outcome parents **before** raw-event deduplication.
- Missing or ambiguous parents/tokens raise; raw event, transaction and financial projection roll back together.
- Records a projection-completion receipt inside the same successful transaction; API roles cannot read/write it and service role only receives SELECT. The security-definer writer owns receipt insertion.
- Exact replay returns false only with matching canonical identity/payload and a completion receipt. Duplicate mismatch raises.
- Existing raw events without a receipt **halt for historical reconciliation** instead of being automatically stamped or silently acknowledged.
- Replayed creation also requires the market identity and complete token map. Self-transfer no-op and explicit global nonce/cancellation/bond events remain supported.
- Includes exact old function-body fingerprint precondition. Existing leased wrapper remains unchanged; lease expiry continues to prevent event/checkpoint writes.

It does not independently verify blockchain receipts in SQL, remove service-role custody risk, or reconstruct history. Receipt presence is not a guarantee against later privileged manual corruption. Multi-connection locking/reorg/load tests and a real staging reconciliation remain required. The existing application preflight remains an additional layer, not an atomic substitute.

## Local verification (isolated, synthetic fixtures only)

Run:

```sh
npm --prefix protocol run test:security-sql
node --test protocol/test/indexer-projection-guard.test.mjs protocol/test/job-fencing.test.mjs protocol/test/indexer-config.test.mjs protocol/test/base-account-proof.test.mjs
```

The nested SQL-test runtime pins PGlite 0.3.14 with its own lockfile; production application dependencies are unchanged. It executes actual PostgreSQL SQL in an isolated WASM database with no external connection, not regex-only policy assertions. Test-only users, addresses, events and balances never enter the existing Supabase project or a chain. Core UUID generation suffices for tested paths; fixture setup omits the unneeded pgcrypto extension.

Covered: actual role privilege denial (including truncate and independent column grants), future-object defaults, all 11 market-bound event parent checks, chain isolation, exact replay, canonical mismatch, legacy partial projection halt, raw-event/transaction/receipt rollback on financial constraint failure, unmapped batch rollback, known transfer/self-transfer/global-event behavior, own/other/unverified/revoked wallet isolation across positions/claims/refunds/orders/portfolio, expired lease/event/checkpoint rejection, and disabled browser telemetry.

Current combined result: **33/33 tests passed**, including 12 isolated SQL/client tests (parent suite included) and 21 existing mocked/config/fencing tests. TypeScript `tsc --noEmit`, targeted wallet TypeScript lint and `git diff --check` passed. A no-secrets/no-deploy SQL-test step was added to the draft Native USDC protocol CI workflow. Remote CI status is not asserted until its run is actually observed.

These tests do not establish production A/B runtime behavior, full real-Postgres concurrency semantics, deployed FeeV2 E2E, maker liquidity, provider validity or production indexer liveness. The six existing contracts and FeeExchangeV2 Solidity are unchanged by this patch; earlier contract test results are historical, not rerun here.

## Exact remaining blockers and next safe steps

1. **Review corrections before any application.** Inspect schema/constraint drift and the seven live routine mismatches; establish why the migration ledger is absent. No automatic migration-history repair/replay.
2. **Authorized isolated staging:** reproduce current production metadata shape, then apply the two SQL proposals and client patch only there. Run real two-session race/rollback, unlinked/revoked/other-wallet, RPC/column-grant and external orderbook compatibility tests. Source-derived isolated fixtures are not a production schema clone.
3. **Indexer history and rollout:** obtain approved redacted deployed revision/checkpoint/liveness evidence; enumerate missing parents and missing projections against finalized receipts at one checkpoint. Review the discrepancy report before any backfill. Quiesce the writer before approved SQL replacement, validate receipt/checkpoint boundaries, and resume only an approved writer. Never blind-rewind checkpoints or prefill completion receipts for old events.
4. **FeeV2:** still an undeployed separate reviewed prototype. Needs independent security review, versioned exchange/fee escrow/refund schema, canonical fee-event indexer/reorg reconciliation, backend/order domain/UI integration and testnet lifecycle. Fees escrow until final non-VOID RESOLVED; actual VOID refunds original buyers separately from principal; existing V1 remains fee-free. No old-vault surplus sweep is authorized or implemented.
5. **Operational launch gates:** fresh Base deployment/pause/roles/accounting checks, actual provider binding/quota checks, locked settlement-source rules, real reviewed liquidity, bounded creator/keeper permissions and wallet claim/refund simulations. Five-minute market close still does not bypass immutable 24-hour oracle challenge.
6. Only then present **exact scoped** production migration/client release/V2 deployment/transaction plans for human approval. Do not merge Draft PR, deploy, activate signing/trading, approve collateral, fund makers, transfer funds or submit mainnet transactions during these fixes.

No same-day real-money launch guarantee is made. The user requested concrete fixes; this update implements reviewable code and tested SQL proposals while preserving the production approval boundary.
