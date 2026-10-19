# Deployment bindings and fail-closed indexer follow-up

**No production change authorized or performed. Draft PR #3 stays open/draft.**

Base review commit inspected: `0b47cabb1f40c500a8d91aa631b3e5f0caf12353`.
Main: `4c16eb7e14dd1d187c9bef3055d215caae075d05`; development: `47fa8f98a0a844deaba6d136fb77fdc884503b86`.
Changes in this follow-up are review-branch code/tests/docs only. No secret value was read or printed. No workflow dispatch, production deployment, migration, SQL mutation probe, policy edit, signer activation, fund transfer, mainnet transaction or trading activation occurred.

## Finding classification and evidence

“Production-verified” below means the narrowly stated live GET observation, not a general security certification. “Source-only” is repository behavior or local/mocked verification, not proof that production runs the reviewed implementation. “Unverified” means the necessary authorized evidence is absent.

| Finding | Classification | Evidence / limit |
|---|---|---|
| `tacpredict-app` is routed to `tacpredict.fun/*` and `www.tacpredict.fun/*` | **Production-verified** | Cloudflare GET script metadata, `SPORTS_DEPLOYMENT_BINDING_EVIDENCE.json` |
| Both expected sports names absent from production Worker secret list AND settings binding names | **Production-verified** | Both metadata endpoints HTTP 200; no values returned by the audit |
| Runtime flags include `nodejs_compat` and `nodejs_compat_populate_process_env` | **Production-verified** | Worker settings GET; this establishes configuration, not API health |
| GitHub Secrets do not get mapped by the checked-in deployment workflow | **Source-only** | Workflow/scripts inspected across main, development and review; workflow/config blob hashes match across all three |
| Provider server code expects exact `FOOTBALL_DATA_API_KEY` / `CRICKET_DATA_API_KEY` names | **Source-only** | Both current main/development and review provider files use these constants; provider file versions differ in other unrelated crypto details |
| GitHub currently stores usable values, provider validity and quota/access | **Unverified** | Storage location is owner-reported; no secret value retrieval, provider API test or GitHub secret-management mutation performed |
| Anonymous zero-row reads succeed for `users`, `wallets`, public native views/market data, but tested private endpoints reject unauthenticated reads | **Production-verified, limited** | Fresh `SUPABASE_ZERO_ROW_READONLY_CHECK.json`: 42 endpoints, 14 HTTP 200 / 25 HTTP 401 / 3 HTTP 404. Zero-row queries contain no user rows and do NOT establish policy safety or write authorization |
| Migration 020 contains permissive anonymous `users`/`wallets` INSERT/UPDATE grants/policies | **Source-only** | Same migration directory Git tree across all inspected branches: `410d6e5dcd6163a915690a6c5a8c194937d9f3f8`; actual live application/grants still unknown |
| Raw native ownership reads omit explicit `verified_at`; old public orderbook view is broader than the signed-order RPC | **Source-only** | Source findings F-02/F-03 in `SUPABASE_SECURITY_FOLLOWUP.md`. Public view zero-row access is live-verified, but live predicate/owner/options are NOT |
| Applied migration history, live RLS/ACLs/function definitions, anonymous write authorization, verified-wallet invariants and user-to-user isolation | **Unverified / release-blocking** | No authorized project SQL session or metadata result; see access status below |
| SQL can acknowledge a financial event with no market projection | **Source-only** | Migration 011 `IF m.id IS NULL THEN RETURN true`; whether this happened in production is unverified |
| New application preflight prevents missing/mismatched projection from reaching apply/checkpoint | **Source-only remediation** | New guard + 12 local tests including actual indexer orchestration under a total network mock. NOT deployed; not an atomic SQL replacement |
| Historical events/projections/checkpoint integrity and actual deployed indexer revision | **Unverified** | Needs authorized read-only reconciliation; no automatic replay/reset or repair performed |

## 1. Why GitHub Secrets are not reaching the Worker

Source: repository-root [`.github/workflows/deploy-cloudflare.yml`](../../../.github/workflows/deploy-cloudflare.yml), [`prepare-workers-deploy.cjs`](../../scripts/prepare-workers-deploy.cjs), [`package-cloudflare.cjs`](../../scripts/package-cloudflare.cjs), [`providers.server.ts`](../../src/lib/sports/providers.server.ts).

- Job explicitly maps only deployment credentials, public Supabase settings and WalletConnect configuration. Neither sports secret is referenced. No sports `wrangler secret put`, secret bulk upload or equivalent API binding step exists in the inspected workflows/scripts.
- Normal production deployment is gated to `refs/heads/main`, targets `--name tacpredict-app` and uses the generated `.output/cloudflare/wrangler.json`. Development validates but is not the production deploy gate. The review branch does not trigger that production push gate.
- The job has **no GitHub `environment: production` selector**. If secrets are stored as GitHub Environment secrets rather than repository secrets, this job also has no environment selection that would make them available. Their precise GitHub scope was not independently inspected.
- Generated config has `name: tacpredict-app`, no named Wrangler `env.production` section, and server `vars` containing public Supabase settings only. `--keep-vars` is NOT a mechanism to import arbitrary GitHub Secrets. Do not put provider keys into plaintext `vars` or `VITE_*` to work around this: the workflow prints the generated configuration and VITE values can enter browser assets.
- Server provider code accesses `process.env` using the exact two names. The observed runtime compatibility flags support that access once remote secret bindings actually exist. The wrapper passes `env` to the SSR handler. An actual authenticated provider health test is still required after a separately approved configuration change.

### Exact manual configuration steps — ONLY after separate production approval

Do **not** perform these steps under this read-only request:

1. Sign in to the Cloudflare account containing the Worker. Open **Workers & Pages → `tacpredict-app`**. Confirm its route is `tacpredict.fun/*` / `www.tacpredict.fun/*` before editing anything.
2. Select the existing **production/default deployment** of that exact Worker. Current config has no named Wrangler environment: do not accidentally target/create `tacpredict-app-production`, a preview Worker, or a GitHub Environment merely named production.
3. Open **Settings → Variables and Secrets** (dashboard wording can vary). Add **Secret**, not plaintext variable, with exact name `FOOTBALL_DATA_API_KEY`; enter its value directly from the owner's original secure provider/vault into Cloudflare's private field. Repeat for `CRICKET_DATA_API_KEY`. Do not send values through chat, GitHub comments, committed files, shell command arguments or build logs.
4. GitHub secret values are not a readable configuration store: use the original private value, not an attempted read-back. Do not rotate or replace existing values unnecessarily. If an expected name is already present when the owner checks, stop and reconcile metadata/environment rather than overwriting it.
5. Any **Save/Deploy/Publish** action that updates a production binding/version is a production change. Stop at that boundary until explicitly approved. No such action was taken here.
6. After the approved change, re-list **names/types only**, confirm both secret bindings on `tacpredict-app` production, then perform separately approved provider status/fixture reads with quota awareness. Confirm missing/invalid-key behavior fails honestly. This does not authorize market creation, oracle finalization, unpause or trading.

Future automatic sync would require a separately reviewed protected deployment step with explicit GitHub secret references and a secret-management operation, not merely an Actions `env` entry. Keep values confined to secret APIs/private stdin; never add them to the currently printed Wrangler `vars`. **No workflow/secret-sync change was made in this follow-up.**

## 2. Supabase access and remaining verification

Existing project remains `lmqaiqvwcytmgwgwyfwx`. The dashboard currently presents **Sign in**, no Supabase MCP is connected, and no metadata-only SQL output has been supplied. Earlier private sign-in attempts did not establish an authorized project session. No credentials were extracted or further guessed/retried here.

The provided [metadata-only SQL](sql/supabase-read-only-verification.sql) remains unexecuted. It uses a read-only transaction and catalog SELECTs, inventories all public tables/views/policies/grants/functions and exports no user rows or function/migration bodies. No live migration/RLS claim is made from a source manifest or an anonymous 401/empty result.

Still needed from an authorized existing-project read-only connection or metadata-only result export:

1. Applied `supabase_migrations.schema_migrations` versions/names compared with `SUPABASE_REPOSITORY_EXPECTATIONS.json`; include migration 020 and any later correction.
2. Actual RLS enabled/forced flags, policy predicates/roles/commands, PUBLIC/anon/authenticated effective table/column/function privileges, view owner/options, security-definer owners/search_path and body hashes, public schema CREATE and default ACLs.
3. F-01: determine whether anonymous INSERT/UPDATE grants and lowercase-only checks really apply to `users`/`wallets`; do NOT test by writing fake production rows. These tables must not become native wallet ownership or payout truth.
4. F-02: compare live raw private-data policies and portfolio RPC with `verified_at` requirements; review all privileged binding writers. Actual account/wallet rows are not needed in the report. If a binding invariant check is separately authorized, return only a redacted pass/fail/count, not addresses or account identifiers.
5. F-03: inspect live `protocol_orderbook` view definition/owner and restricted-taker/deployment filters; current zero-row GET only proves endpoint readability. View definition hash can be compared locally without publishing sensitive bodies.
6. User A/B, unlinked/expired/replayed proof and ERC1271 isolation tests belong in an approved isolated staging environment. Metadata proves declared enforcement, not complete behavioral isolation. Do not create production users, consume a wallet challenge or call read-like mutation functions (`register_my_protocol_wallet`, `get_my_native_reward_tasks`) during this audit.

**Next access action needed:** the owner supplies an authorized read-only project session or the script's metadata-only results. Do not paste a service-role key, password, management token or RPC secret into chat. No database fix/migration approval is requested yet.

## 3. Indexer remediation added to this Draft PR, not production

New file: [`indexer-projection-guard.mjs`](../../protocol/scripts/indexer-projection-guard.mjs).
Wiring: [`indexer-core.mjs`](../../protocol/scripts/indexer-core.mjs) now calls it before per-event apply acknowledgement and chunk checkpoint advancement.

- For the 11 market-bound event kinds (including trade, redemption, split/merge, fill, resolution and metadata publication), query the existing chain/market projection first. Missing, ambiguous, wrong-chain, wrong-ID or lossy numeric identifiers **throw before `apply_leased_protocol_event`**.
- ERC1155 transfers require exact token→parent-market projection on the expected chain. Duplicate batch IDs are looked up once; genuine self-transfer no-ops retain existing behavior. Missing/ambiguous token/parent mapping throws rather than relying on a raw duplicate event to conceal missing projection.
- `MarketCreated` legitimately lacks a previous row: validate its ID before apply and require its market row **after either true or duplicate-false acknowledgement**. Missing created projection stops the checkpoint.
- Global `OrderCancelled`, `NonceInvalidated`, `BondWithdrawn` do not invent a market ID or require an off-chain stored order. Unknown guard event kinds fail closed.
- Only actual boolean SQL acknowledgements are accepted. Failure propagates to the existing fenced job runner, records local/mock failure in tests, releases the lease, and never advances the affected chunk checkpoint.
- No broad exception handler converts these errors into successful/skipped finance. No on-chain signing or transaction submission added. The existing request-budget and finalized-chain/bytecode/receipt checks remain.

### What this DOES NOT fix or prove

- This is an application preflight, **not an atomic database constraint**. A privileged writer can bypass it or alter rows between GET and apply. The old unsafe SQL body and service-role bypass path remain unchanged; the guard is not deployed.
- It checks prerequisite presence/identity, not full historical financial projection correctness. A historical duplicate event with an existing parent but a missing trade/claim/balance projection may still require explicit reconciliation. Do not claim duplicate-false proves every old projection is complete.
- Extra reads consume Worker subrequest budget. The bundle builds locally, but real PostgREST relation embedding, high-event chunks, 48-request budget, backlog progress and concurrency require staging/load tests before any release. Exhaustion must stop safely, not skip or auto-advance.
- A post-creation check failure can occur after an individually committed SQL event; the chunk checkpoint stays behind. Replaying the raw event cannot by itself repair a missing financial projection. No production cursor rewind, event deletion, synthetic backfill or automatic repair is performed.

### Recommended atomic SQL correction — proposal only, not a migration

After authorized live verification and separate review/approval:

1. In `apply_protocol_event`, validate market-bound parent existence/identity **inside the same transaction before event deduplication/acknowledgement**. Transfer token lookups must similarly be checked before a duplicate can bypass prerequisites.
2. `MarketCreated` has a special first-write path; on duplicate, verify the corresponding market/outcomes and metadata-derived projection are present/consistent before returning false. Keep global cancellation/nonce/bond events explicit, not dependent on a NULL market lookup.
3. Replace generic `IF m.id IS NULL THEN RETURN true` with a loud failure for market-bound financial events. Handle intentionally raw-only/global events explicitly. Any raise must roll back the raw event and financial writes atomically; no fallback acknowledgement.
4. A duplicate `(chain,tx,log)` must match canonical block/emitter/event identity; conflicting duplicates halt. Establish a reviewed projection/version completion invariant or reconcile each event family before treating old duplicates as complete. Never add a fake completion marker to unverified history.
5. Preserve lease fencing, exact numeric atomic amounts, chain scoping, immutable event identities, financial write restrictions and claim/refund separation. Do not weaken RLS to make the indexer pass.
6. Add real isolated-Postgres tests: missing parent rolls back raw event + transaction + financial row; no checkpoint advance; duplicate raw with missing/inconsistent projection fails; MarketCreated→transfer→trade in one chunk; cross-chain collisions; valid replay leaves balances/trades unchanged; conflict/reorg/expired lease fails; amount conservation and same-chunk retry; all API-role writes denied as intended.
7. Historical repair needs a reviewed canonical read-only discrepancy report first, then an independently approved transactional replay/rebuild plan. Never silently rewind production checkpoints or mutate audited event history.

No SQL definition or migration file was changed or executed. No migration-history checksum was overwritten. `supabase/migrations` remains byte-identical to the inspected branches.

## 4. Validation

- New guard suite: **12/12 local tests passed**, including the actual `runFinalizedIndexer` orchestration with a total `fetch` mock. Mock hosts/fixtures never forward to a real database or chain; no signing/deployment/funding.
- Transaction-free protocol regression: **125/125 passed** across 31 files (includes the new suite). Existing Ganache/deployment suites were deliberately excluded in this read-only task; their prior results are historical, not rerun claims.
- TypeScript, production-format local build, targeted ESLint and local browser-platform bundling of the modified indexer passed; no upload/deployment. Unrelated build-generated route reordering is excluded.
- Regression test path is registered in `protocol/package.json`'s explicit test list. No production workflow was dispatched or changed.
- No live RLS/SQL, database rollback, provider validity/quota, production throughput, independent contract audit or full FeeV2 integration claim follows from these tests.

## 5. Approval gates unchanged

Keep Draft PR #3 open/unmerged. Await authorized read-only metadata, resolve live applicability, separately review any corrective SQL and secret-binding plan, complete isolated staging/reconciliation/load and FeeV2 lifecycle tests, then seek narrowly scoped approval for each production step. **No production change or trading approval is requested by this report.**
