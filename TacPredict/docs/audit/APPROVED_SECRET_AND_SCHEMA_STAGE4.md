# Stage 4 — two narrowly approved actions completed; release still blocked

**PR #3 stays open/draft/unmerged.** The owner's “Ei 2 ta o koro” approved (1) minimized read-only schema/source-allowlisted definition export for isolated local staging and (2) exactly two Text-to-encrypted-Secret conversions on production `tacpredict-app`. It did **not** authorize production DB fixes, application deployment, migrations, catch-up writes, signers, mainnet transactions or trading activation.

This report supersedes Stage 3's pending approval/access statements for those two actions only. Stage 3 was accurate at its historical checkpoint; it is no longer correct to describe the current sports bindings as Text or all production configuration as untouched.

## Verified in production — Cloudflare configuration only

[Sanitized conversion evidence](CLOUDFLARE_APPROVED_SECRET_CONVERSION.json), observation `2026-10-19T14:13:48.543Z`:

- `FOOTBALL_DATA_API_KEY` and `CRICKET_DATA_API_KEY` both confirmed `secret_text` and present in the encrypted-secret list.
- Same existing values submitted within the secure tool runtime. No values returned to chat, logs, files or commits; no keys rotated.
- Other **seven** bindings and runtime settings compared unchanged. Application code ETag compared unchanged: `1401d1b7d2afa4f26b697899bed111cc2ee78d5a94d16a31ba5b83e2596af537`.
- Cloudflare created configuration deployment `b2ea2c65-bcc3-436e-a2e6-e6c552f18862`, version `09bd3d5b-3acc-4410-af65-3382a0056fdf`, at 100%. This is a **configuration-only version**, not an uploaded application-code deployment. Do not claim no version changed.
- Preservation used the API-supported literal `inherit`/`latest` only after active/latest version preflight; only the two approved bindings received new type definitions. Post-read checks confirmed preservation.
- **Unverified:** provider authentication, plan/quota, fixture/result coverage, production application request success and any provider-specific freshness/latency. Secret existence does not prove provider health. No provider requests were made in this continuation.

## Verified in production — read-only catalog snapshot

Existing project `lmqaiqvwcytmgwgwyfwx`, SQL observation `2026-10-20T04:18:48.309511+00:00`, PostgreSQL **17.11**. The authenticated SQL editor ran the [exact catalog-only query](sql/supabase-safe-schema-export.executed.sql) inside `BEGIN TRANSACTION READ ONLY`, with a 30-second statement timeout. [Sanitized scope/hash manifest](SUPABASE_SAFE_SCHEMA_STAGING.json).

- **37 tables, 2 views, 321 columns, 164 constraints, 64 indexes, 29 policies, 36 function metadata entries.** Public schemas/ACLs, selected API role flags and default ACL metadata were also obtained.
- **28 function definitions** exported only when live `sha256(prosrc)` matched reviewed migration source. All imported definition bodies independently passed SHA-256 validation locally. Reading DOM textContent rather than whitespace-normalizing innerText was necessary; digest mismatches stopped reconstruction until the export was read intact.
- **Eight definitions withheld:** `claim_daily_reward`, `get_market_import_admin`, `get_reward_status`, `get_tac_promo_status`, `handle_new_tac_account`, `has_role`, `redeem_tac_promo`, `rls_auto_enable`. The latter is the extra function; seven prior mismatches still require provenance review. Expected `get_user_reward_tasks` remains absent.
- Standard migration ledger still absent. This export is **not** proof that reported migration versions were applied.
- **No application/user rows**, auth identities, passwords, secret values or financial payloads exported. Raw metadata snapshot and definitions retained privately locally, not published in this PR. Public evidence contains counts, hashes, names and scope only.
- No production DB statement changed policies, data, schema or migration history.

## Locally reproduced and fixed — not production repairs

New optional runner invocation:

```sh
node protocol/scripts/run-local-postgres-tests.mjs --schema-snapshot /absolute/private/live-schema.json
```

The private snapshot has wrapper `{metadata, withheldExpressionPaths: []}`. Tests reject non-read-only/unscreened snapshots, unmatched function bodies, unsupported metadata and missing isolated-runner socket. No `.env`, production DB URL, signer or TCP database listener is used. The pinned PostgreSQL **17.9** runtime uses an ephemeral private Unix socket/database and cleans up after testing. Never publish the private snapshot to CI artifacts or commit it.

Reconstruction includes public table/enum definitions, constraints/indexes, two views, direct relation/column/function/schema ACLs, 29 policies, RLS flags and relevant public/global default ACLs. Default ACL replay first revokes existing direct defaults in each represented scope. Unmatched function definitions and the `auth.users` trigger `tac_account_created` are excluded. Supabase auth tables/helpers are minimal **emulations**, not actual GoTrue, signed JWT validation, wallet proof validation or a full production clone. Role memberships, non-public subsystems and all unexported function behavior are outside coverage.

On the live-derived subset, local tests:

1. Reproduce anonymous alternate `users` write privilege and absent explicit `verified_at` policy predicates.
2. Reproduce the actual old `apply_protocol_event` missing-parent defect: a local fake financial event is acknowledged/raw-stored although no trade projection exists.
3. Apply existing reviewed privacy/ACL and atomic-projection proposals **only to the disposable local database**. Exact live function-body preconditions pass; they were not bypassed.
4. Verify alternate-table/view anonymous grants and column/TRUNCATE grants revoked; future anonymous/authenticated table writes/function execution denied.
5. Verify a missing-parent financial event fails and rolls back its raw acknowledgement.
6. Verify synthetic owner A/B isolation for positions, claims, refunds, orders and portfolio; anonymous access denied; unverified wallets invisible; revoking ownership proof removes private reads.
7. Preserve existing real PostgreSQL concurrency tests for idempotency, rollback, parent locks, lease takeover and atomic batch transfers.

**Fresh result: 29/29 PostgreSQL runner tests passed**, zero failed/skipped (includes existing 21 runner cases and the new parent/subtests; not an additional 29 unique security properties). Syntax, formatting and diff checks are recorded separately in the validation manifest. Prior Solidity/EVM results remain historical Stage 3 evidence, not freshly rerun here. These tests are not an independent audit, full production E2E or a live-17.11 replica.

## Remaining blockers and safest next sequence

1. **Production privacy/ACL/indexer fixes remain unapplied.** Review exact SQL, compatible application read paths, current hashes, lock budget, backups and rollback. Resolve unmatched function/migration provenance. Obtain bounded production-change approval only after this review; do not bypass hash preconditions or silently add functions from another version.
2. **Historical indexing coverage remains unproven.** Stage 3's 57,488-block lag is a historical snapshot, not a current remeasurement. Obtain approved private minimized reconciliation inputs and canonical finalized receipts/logs, then a bounded projection-only catch-up plan with fencing, receipt checks, stop-on-mismatch and range/request budgets. Never jump checkpoints, fabricate receipts or acknowledge missing projections. No catch-up job was triggered here.
3. **Public orderbook compatibility:** retiring broad legacy view grants is locally validated. Complete current-client/RPC restricted-taker, publication, verified-deployment/trading-enabled and wallet-proof E2E review before applying the proposal. No claim that every public RPC is fully verified.
4. **FeeExchangeV2:** separate, undeployed, no activation. Finish versioned exchange registry/schema, ERC1271/order backend, on-chain fee/transfer event reconciliation and frontend approvals/refunds/release lifecycle. Buyer fee is additional 1%; VOID fee refunds require escrow and original-buyer tracking, separate from principal. Treasury release only on actual final non-VOID RESOLVED; immutable 24-hour Oracle challenge respected. No losing-user collateral or unclaimed liabilities become platform surplus. Independent review and approved testnet E2E still required.
5. **Providers / release:** safe authorized health/freshness/quota checks still needed. Resolve baseline compatibility, actual CI, source/ABI/role/backing/liquidity and full wallet E2E before any deployment or trading approval. Secret type conversion alone does not make markets tradable.

No request for mainnet deployment/activation approval is made on the basis of this scoped validation. No funds moved, collateral approved, real market created, role changed, mainnet call submitted or existing contract redeployed.
