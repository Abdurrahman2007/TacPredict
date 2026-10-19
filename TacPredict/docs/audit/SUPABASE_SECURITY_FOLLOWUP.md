# Read-only Supabase / FeeExchangeV2 security follow-up

**Release verdict: BLOCKED. Draft PR must remain open; no trading activation is recommended.**

This review made no database writes, migration applications, contract deployments, mainnet transactions, approvals, role changes or trading configuration changes. Only repository/document edits, local transaction-free tests, browser authentication attempts, public REST GETs with `limit=0`, and Cloudflare GET metadata were used. Authentication attempts are not database/schema verification.

## Evidence boundary and inspected revisions

- Existing project: `lmqaiqvwcytmgwgwyfwx` (`https://lmqaiqvwcytmgwgwyfwx.supabase.co`). No replacement project.
- Review source: `3affa5c955238d834de36cff8748b47956f08319`; development: `47fa8f98a0a844deaba6d136fb77fdc884503b86`; main: `4c16eb7e14dd1d187c9bef3055d215caae075d05` at inspection. An isolated detached worktree preserved other local uncommitted changes.
- Draft PR #3 was confirmed **open, draft, unmerged** before this documentation update. No base-branch merge or live application release was performed.
- No Supabase MCP connection is available. Secure browser sign-in attempts did **not** establish an authenticated project session; a supported GitHub sign-in alternative also requires authentication. No session token, password or management credential was extracted or printed. No authorized SQL result was supplied.
- Therefore **applied migration history, live RLS definitions, effective grants, security-definer implementations, actual checkpoint freshness and authenticated user A/B isolation remain UNVERIFIED**. Source inspection and zero-row responses must not be relabeled as those proofs.

Evidence files:
- [Fresh GET-only zero-row checks](SUPABASE_ZERO_ROW_READONLY_CHECK.json).
- [Repository migration and final function-body expectations](SUPABASE_REPOSITORY_EXPECTATIONS.json): 21 source migrations, 36 parsed final public function bodies; file SHA256 and exact `prosrc` MD5 expectations. Hash matches do not prove safe ACLs/owners/search_path or successful historical execution. SQL formatting changes can change a body hash without changing semantics; a mismatch requires review, not automatic replacement.
- [Expanded metadata-only SQL](sql/supabase-read-only-verification.sql), **not executed** and outside the migrations directory.
- [Sports secret-name check](SPORTS_SECRET_BINDING_CHECK.json).
- [Pure fee arithmetic checks](FEE_V2_READONLY_ARITHMETIC_CHECK.json).

## 1. Applied migrations: NOT yet verified

The repository includes baseline/reward migrations plus native migrations `202610080004`–`202610080016` and later discovery/wallet-sync migrations through `202610120020`. The previous statement that 004–016 were applied is still historical input, not a fresh verified fact.

Required comparison on the existing project:
1. Export only `version,name` from `supabase_migrations.schema_migrations` via the read-only script.
2. Compare every returned version/name with `SUPABASE_REPOSITORY_EXPECTATIONS.json`; classify missing, unknown, renamed and out-of-order entries. Do not automatically apply a missing migration.
3. Compare resulting live schema, policies, ACLs, constraints, view/function hashes and function settings. A migration-history row alone does not prove present-day schema matches the file or that a later manual change did not weaken it.
4. Specifically establish whether `202610120020_web3_wallets_users.sql` is applied and whether any subsequent corrective policy exists. Anonymous zero-row `users`/`wallets` reads confirm endpoint access only, NOT migration identity or write authorization.

## 2. RLS / privacy matrix

The following are **repository expectations**, not verified live policies. The diagnostic SQL now inventories **all public relations**, not merely `protocol_%`, so alternate wallet tables and legacy rewards cannot escape review.

| Source table group | Intended access / source behavior | Fresh anonymous observation / remaining proof |
|---|---|---|
| `protocol_deployments` | public SELECT of verified rows; no API writes | zero-row GET 200; actual predicates/grants pending |
| `protocol_markets` | public SELECT of published rows | 200; unpublished-row isolation pending |
| `protocol_market_outcomes`, `protocol_market_sources`, `protocol_market_rules`, `protocol_trades`, `protocol_market_prices`, `protocol_resolutions`, `protocol_resolution_evidence`, `protocol_disputes` | public SELECT only for published parent market | 200; policy bodies, RPC/view exposure and write denial pending |
| `protocol_wallets`, `protocol_positions`, `protocol_orders`, `protocol_claims`, `protocol_refunds`, `protocol_notifications` | authenticated own-account reads; financial writes trusted server/indexer only | 401 on tested zero-row GETs; authenticated own/other-wallet enforcement pending |
| `protocol_market_metadata`, `protocol_audit_logs` | authenticated admin-only reads; controlled writes | 401; actual admin/MFA-related function permissions pending |
| `protocol_wallet_link_challenges` | service-role only; single-use expiring challenge | 401; effective ACL and function privilege verification pending |
| `protocol_transactions`, `protocol_chain_events`, `protocol_indexer_checkpoints`, `protocol_job_leases`, `protocol_job_runs` | trusted writer/read-only operational boundaries; not public financial-write APIs | 401; effective grants, fencing and actual running configuration pending |
| `protocol_reward_credits` | own-account SELECT; locked promotional credit, no withdrawal authority | 401; authenticated policy and constraints pending |
| `profiles`, `points_transactions`, `predictions`, `user_roles`, `verified_usdc_events`, `locked_reward_credits`, `tac_promo_codes`, `tac_promo_redemptions`, `tac_promo_attempts` | legacy/account/reward policies must be reviewed separately; not native collateral | catalog script and zero-row probes cover repository-declared relations; no claim of complete live enforcement |
| `market_import_policy`, `market_candidates`, `market_agent_runs` | admin/service import functions; discovery is not financial settlement | catalog script and zero-row probes cover repository-declared relations; live grants/functions pending |
| `protocol_market_metrics`, `protocol_orderbook` views | public view surfaces; orderbook definition needs F-03 review | both zero-row GET 200; view owner/options/predicate verification pending |
| alternate `users`, `wallets` | **source has permissive anonymous SELECT/INSERT/UPDATE**; see F-01 | GET 200 for both; NO write probe performed |

Fresh check totals: 42 repository-declared/previously scoped endpoints, 14 HTTP 200, 25 HTTP 401 and three HTTP 404. The evidence retains all failed-name/unavailable-relation probes transparently; a 404 may reflect absent or unexposed schema-cache relations, not definitive migration history. The names were `locked_usdc_rewards` (a previous mistaken-name probe), `verified_usdc_events` and `locked_reward_credits`; the latter two are real source-defined legacy reward tables, so their live applicability needs explicit reconciliation. A 401 or empty response does not prove RLS enabled or a correct ownership policy; GET-only probes cannot establish absence of other RPC/view/write channels. REST OpenAPI metadata also returned 401.

The catalog script collects RLS enabled/forced flags, policies, table/column ACLs including PUBLIC, effective API-role privileges including TRUNCATE, view options/hashes, routine security/execute privileges/body hashes, schema CREATE privileges, BYPASSRLS/ownership/inheritance, default ACLs, constraints/indexes, trigger targets and publication membership. It does not export user records, migration statement bodies, function source bodies, key values or event payloads.

## 3. Concrete source findings (NOT automatically live exploits)

### F-01 — HIGH: alternate wallet-sync tables allow anonymous mutation in source

Source: [`202610120020_web3_wallets_users.sql`](../../supabase/migrations/202610120020_web3_wallets_users.sql), [`sync-wallet.ts`](../../src/lib/web3/sync-wallet.ts), [`use-wallet-sync.ts`](../../src/hooks/use-wallet-sync.ts).

- `users_select_anon` / `wallets_select_anon` use `true`; INSERT/UPDATE policies validate lowercase address only. Grants include SELECT, INSERT, UPDATE for both anon and authenticated.
- No signature, `auth.uid()` ownership or column-limited UPDATE grant restricts those tables in this migration. If applied unchanged, clients can spoof telemetry and alter exposed `usdc_balance`, `total_trades`, activity and wallet-to-user associations. RLS being enabled alone does NOT fix permissive policies.
- The client sync path runs on a connected address, not an ownership proof. These tables are distinct from `protocol_wallets`; their `users.id` is not `auth.users.id`.
- Inspected native order/portfolio paths use `protocol_wallets`, not these alternate tables. **No direct native-vault withdrawal exploit is established by this finding.** Nevertheless these records must NEVER become financial truth, proof of ownership, fee/reward funding or payout authority.
- Live status: both tables permit anonymous zero-row reads, but INSERT/UPDATE policy/grant applicability is unverified. No production mutation probe.
- Next step: review live ACLs/policies and all consumers; propose a separately approved corrective migration using verified server-owned identity / minimal telemetry writes or remove financial-looking fields from this trust boundary. Do not run that migration under this read-only request.

### F-02 — MEDIUM defense-in-depth gap: raw native RLS does not require `verified_at`

Source: migration 004 ownership policies and migration 012 `get_my_protocol_portfolio()`.

Policies for wallet-linked positions, claims and refunds check wallet `user_id=auth.uid()` but do not explicitly require `verified_at IS NOT NULL`. Portfolio RPC also omits that predicate. This is **not proof of a present bypass**: the reviewed write paths establish ownership before binding and ordinary API users have no table-write grant. However an inconsistent historical/admin/service-role binding (`user_id` populated without proof) would be readable by that account. The policy names saying “verified” are not themselves enforcement.

- Later activity/reward RPCs in migration 013 explicitly require `verified_at`; behavior is inconsistent across raw and RPC reads.
- Required: live policy/body-hash comparison, review of all binding writers and an authorized invariant result that no unproven binding grants access (return only a redacted pass/fail, not account/address rows). Add explicit verified-wallet predicates only through a separately reviewed/approved migration; prove own/other/unlinked/revoked access in isolated staging.

### F-03 — MEDIUM privacy gap: old public orderbook view is broader than the public RPC

Source: migration 004 `protocol_orderbook` view versus migrations 007/009 `get_protocol_signed_orderbook()`.

The public view uses `security_barrier=true` (not `security_invoker=true`) and grants SELECT to anon/authenticated. It omits the public RPC's zero-address `taker` filter and deployment `verified/trading_enabled` filter. A privileged view owner can expose restricted-taker maker/taker, size and pricing through this route even while the stricter public signed-order RPC filters them. The view does **not** expose signatures/account UUIDs in its selected columns; do not overstate the leak as forged trading authority.

Live view owner/options/grants/body and actual data remain unverified. Align or retire this view only after an approved migration and compatibility review. Public open-order signatures are intentionally discoverable; restricted-taker records are a distinct policy decision.

### F-04 — HIGH projection-integrity gap: missing-market financial events can be silently acknowledged

Source: migration 011 `apply_protocol_event()`: after market lookup, `IF m.id IS NULL THEN RETURN true`.

For market-bound financial events such as `TradeExecuted` or `PositionRedeemed`, an inconsistent/missing market projection can result in a canonical event being recorded but its trade/claim/refund projection not being produced; the caller can still advance the checkpoint. This is a source-level fail-open projection condition, not evidence that a real event was lost in production. Some non-market events legitimately lack a market and must not be lumped into a blanket rejection.

Require unknown/missing market failure for the specific market-bound financial event set, explicit handling for legitimate non-market events, rollback/replay tests and reconciliation against finalized receipts/counters before any corrective migration. Do not silently reset checkpoints, rebuild production projections or mutate event history during this audit.

### F-05 — TRUST BOUNDARY: service role can bypass RLS and unfenced entry points

Source: migration 004/011 `apply_protocol_event`, migration 014 leased wrappers, `client.server.ts`, `job-client.mjs`.

The normal indexer uses fenced RPCs, but the original unfenced event RPC and table-write privileges remain available to the service role. SQL trusts that role's validated payload; it cannot independently prove an RPC receipt. Thus security depends on server-only custody of that key and every privileged application/worker path—not just policy declarations. This is an explicit trusted-writer architecture, not an anonymous-write finding for native protocol tables.

Required: effective live grants, all service-role RPC callers, least-privilege separation design, schema CREATE/default ACL/function search_path checks, actual deployed indexer version and canonical checkpoint/liveness evidence. Never use a management/session credential as an application browser key.

### F-06 — READ-ONLY AUDIT HAZARD: read-like application RPCs can mutate

`register_my_protocol_wallet()` can INSERT/UPDATE ownership links. `get_my_native_reward_tasks()` can INSERT promotional reward credits; portfolio fetching calls registration first. **Neither was executed during this audit.** Metadata-only SELECTs are safer than exercising application read endpoints in a no-writes production audit. No “SELECT function()” is assumed read-only just because it uses SELECT syntax.

## 4. Wallet ownership: source trace and live proof still required

Verified in inspected source:
1. `requireSupabaseAuth` validates session claims through Supabase and derives `context.userId`; the caller cannot pass an arbitrary account ID into the public server-function handler.
2. Challenge endpoint: authenticated context, five-minute SIWE message, fresh random nonce, account/domain/chain binding, rate limit; service-only challenge storage.
3. Prove endpoint: user-bound unused/nonexpired challenge, Base chain-ID check and `verifyMessage` for the stored address/message (including smart-wallet support), then atomic `consume_protocol_wallet_link`.
4. Consumption: service-role EXECUTE only; atomic expiry/single-use update; cannot steal an address linked to another user. Account claims do not come from editable user metadata.
5. Registration fallback uses server-managed `auth.identities` with web3/ethereum provider, not connection state or user-editable metadata; ordinary email/social sign-in alone is insufficient.
6. `saveVerifiedOrder` checks verified wallet owner + signature, verified deployment/code hashes, chain, market identity, status, nonce/cancellation/fills, exact balances/approvals and indexed token against contract in the review branch. It stores signed intent only; this is not a fabricated matched trade.
7. Activity RPC uses both account binding and `verified_at`; raw RLS/portfolio's weaker invariant is F-02. No direct browser/private-table write was found in these reviewed native paths.

Still required: actual live function/grant/owner/hash comparison; no anonymous financial writes via views/RPCs/triggers; authenticated user A cannot read user B's positions/claims/refunds/challenges or bind another wallet; replay/expired/wrong-domain/wrong-chain signatures rejected; ERC1271 behavior; old unverified bindings; and configured Supabase Web3 identity provider. Dynamic A/B and challenge-use tests require isolated staging authorization—not production writes or user impersonation here.

Review-branch identity/token cross-checks are not yet merged into current development/main. Do not claim a live app runs review guards merely because PR code passes tests. Preserve newer pool/UI work during any separately approved merge.

## 5. Indexer/application write paths: source assessment

Source: `protocol/scripts/indexer-core.mjs`, `job-client.mjs`, migrations 004/006/011/014.

Preserved protections in the reviewed normal path:
- Exact existing-project hostname, supported chain / actual RPC chain match, verified deployment and six runtime hashes, native collateral pointer.
- Finalized-block boundary; prior checkpoint hash mismatch halts instead of rewriting history; ordered logs; strict ABI decode; unknown ABI halt.
- Successful receipt and canonical block/log membership checks. Reverted inner-call logs cannot produce a finalized fee/trade record; deployment/account bundles additionally need their explicit inner-success checks.
- Event allowlist/emitter restrictions, unique `(chain,tx,log)` idempotence, SQL transaction rollback on failure, chain-scoped cancellations, exact numeric atomic projections and generated chain-aware market IDs.
- Database row-lock lease fencing, heartbeat loss halt and compare-and-set checkpoints.

Limits: F-04 missing-market acknowledgement; F-05 privileged bypass; actual deployed code/checkpoints not freshly verified; DB alone does not authenticate external provider truth; source/metadata publication does not prove oracle correctness. Claimed principal comes from Positions redemption events, not a UI button or historical purchase price.

**FeeV2 is not integrated into these V1-only paths.** Adding its address without reviewed ABI/event/receipt/accounting support would either be ignored or halt indexing. A versioned exchange-instance registry, order domain/parser, canonical event projection/reconciliation, ownership-bound fee refund reads and separate fee/principal ledgers are still required. No such production migration or configuration was run.

## 6. FeeExchangeV2 escrow / refunds / release verification

This is a **source-and-local-test assessment of an undeployed prototype**, not live escrow-balance verification or an independent security audit. See [complete V2 design/integration requirements](FEE_EXCHANGE_V2_IMPLEMENTATION.md) and `protocol/contracts/FeeExchangeV2.sol` at the inspected review commit.

| Property | Source / prior local verification |
|---|---|
| Additional buyer-only 1% | fixed 100 bps; cumulative integer floor delta per signed BUY scope (or direct SELL+buyer scope); signed fee/treasury/all-in cap; all legs atomically revert on failure |
| Escrow backing | buyer->seller notional; buyer->V2 fee; shares->buyer. Native Positions principal and Oracle bonds untouched. Fee transfer exact incoming balance delta checked |
| Global conservation | `totalFeesCollected = totalFeesRefunded + totalFeesReleased + totalFeeEscrow`; actual USDC must cover escrow; donations are not fee revenue |
| VOID fee refund | only actual Registry VOID; original payer receives `feesPaid-feesRefunded`, even after selling shares; helper cannot redirect; principal share payout remains separate |
| Final non-VOID release | only actual RESOLVED; fixed immutable treasury; one-time market guard; open/closed/resolving/disputed/VOID cannot release |
| No double refund/release | checks-effects-interactions, counters reduced before transfer, nonReentrant; each market terminal is immutable in reviewed Registry; failed token transfer reverts state |
| No privileged drain | no owner/admin fee setter, treasury setter, generic sweep or user-collateral withdrawal; genuine old-vault surplus is not claimed |
| Challenge / timeout | existing 86400s challenge preserved; fee refund requires actual terminal VOID, not merely elapsed time; trading pause does not disable valid terminal fee recovery |

Prior checkpoint at this exact source commit: full local runner **129/129 passed**, including 15 FeeV2 scenarios with dispute, real challenge duration, partial fills, ERC1271, reentry/rejecting receiver, transferred shares, multiple original buyers, duplicate calls, pause and escrow conservation. These Ganache contract tests were **not redeployed/rerun during this read-only follow-up**.

Fresh transaction-free checks this follow-up: **13/13** identity, fencing, indexer configuration and inner-account proof tests passed; **5,000** deterministic BigInt quote-fill checks across 1,000 scopes passed. They do not prove live RLS or V2 indexer E2E.

Residual fee risks: separate new order scopes reset sub-atomic fee carry; V1 remains fee-free/bypassable; USDC issuer freeze/blacklist can block transfer; immutable treasury custody/lost-key decisions remain; no donation recovery; trusted resolver/arbiter model remains; no full deployed V2 frontend/backend/indexer flow, fuzz campaign, freeze-transfer campaign or independent audit. Never promise purchase-price principal refund on VOID: V1 pays current shares at equal weights; only actually collected execution fees are fully returned to original buyers.

## 7. Sports key follow-up / request to test trading

Cloudflare GET inspection identified `tacpredict-app` serving `tacpredict.fun/*` and `www.tacpredict.fun/*`. Its secret-name list did not include `FOOTBALL_DATA_API_KEY` or `CRICKET_DATA_API_KEY`, and contained no other football/cricket-named secret. These are the binding names expected by `src/lib/sports/providers.server.ts` in inspected source.

No secret value was requested/read, copied or printed. This is not proof the user did not add keys: they may be in GitHub Secrets, another worker or an environment not inspected. Ask for **location/environment only**, never the key value. No provider API call, validity/quota claim, binding update or worker redeploy was performed. Secret presence alone would not establish settlement safety, liquidity, final result trust or readiness to activate trading.

The user's request to start testing is recorded, but these blockers prevent a responsible real-money activation. Keep the draft unmerged and trading configuration unchanged. Prefer separately authorized local/staging/testnet lifecycle checks after policy and provider configuration review; no collateral approvals, signer activation, maker funding, market creation or unpause was executed.

## 8. Exact next steps — no deployment approval request yet

1. Establish an authorized **existing-project read-only** dashboard/DB connection, or have the project owner run the metadata script and return metadata-only results. Do not paste passwords, session tokens, service-role keys or RPC credentials into chat. The script itself is not a migration.
2. Compare migration inventory and live RLS/ACL/view/function metadata with the repository manifest. Check ALL financial/private tables, legacy rewards, alternate wallet records, default privileges, public schema CREATE, security-definer owners/search_path and every reachable RPC/view. Record verified pass/fail per surface; missing privileges/results remain blocked.
3. For F-01–F-04, determine live applicability. Propose minimal non-destructive corrective code/migrations and tests for separate review/approval; do not execute fixes or production probes now. Review downstream consumers so alternate balances cannot become payout truth.
4. Obtain metadata-only evidence of deployed indexer revision/config identity and a separately authorized redacted operational checkpoint (chain/block/hash/liveness, no user/event payloads). Reconcile at one finalized canonical checkpoint. Do not run `indexer.mjs` during read-only verification: it writes checkpoints/projections.
5. Obtain authorization for isolated staging A/B wallet isolation and replay tests. Do not create or modify production auth users, wallet bindings, challenge/reward rows, or fabricate financial fixtures in the existing production DB.
6. Confirm where the football/cricket secrets were added and the exact worker/environment binding names; then separately approve binding corrections/provider health tests if required. No key values in reports.
7. Complete reviewed FeeV2 schema/indexer/order/backend/UI integration plan and local/staging reconciliation/failed-transfer/reorg tests. Keep V1 and separate UpDownPool economics distinct; preserve newer UI changes. Resolve fee-escrow treasury custody and all residual risks before approval.
8. Only after those gates, an independent contract review and testnet lifecycle, request narrowly scoped human approval for any deployment or mainnet step. **No activation/deployment approval is requested in this report.**

## Subsequent deployment/indexer follow-up

[Deployment bindings and fail-closed indexer follow-up](DEPLOYMENT_BINDINGS_AND_INDEXER_FOLLOWUP.md) classifies each finding as production-verified, source-only or unverified, records the absent GitHub→Worker secret mapping and exact approval-gated manual setup steps, and adds a review-only projection preflight with mocked checkpoint regressions. It does NOT replace the unsafe live/unverified SQL or complete live RLS verification. All production changes remain blocked; Draft PR #3 stays open.
