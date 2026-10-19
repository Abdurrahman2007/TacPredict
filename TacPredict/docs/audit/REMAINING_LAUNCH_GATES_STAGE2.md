> **Newer continuation:** [Stage 3 live aggregate reconciliation and integration fixes](LIVE_RECONCILIATION_AND_INTEGRATION_STAGE3.md). The aggregate-only query was subsequently approved and executed read-only; historical blockers below must be read with the new evidence.

# Remaining launch gates — second implementation checkpoint

**Release verdict: BLOCKED. Review branch only. This is concrete local implementation/test progress, not production activation or an independent audit.**

## Work completed in this checkpoint

1. **Real PostgreSQL 17.9, independent sessions.** Added a pinned optional local test runtime, reusable source-derived fixtures and two-session regression suite. Same-event races project once; conflicting duplicates fail; rollback/retry is safe; parent and lease locks block racing writes; legacy incomplete events cannot acquire fake completion markers; failed batch transfers roll back all token movements. No TCP listener or external database fallback. Test servers were stopped after the runs.
2. **V1 historical reconciliation software.** Added an offline, BigInt-based, report-only snapshot auditor and tests. It checks raw/canonical identity, missing/extra financial projections, market/hash/token mappings, transfer-derived positions, collateral and executed-notional volume; reports redact wallet identities. It refuses FeeV2/Pool semantics, incomplete inputs, numeric financial floats, oversized inputs and existing output-file overwrites. Clean supplied input never authorizes launch or proves independent canonical coverage.
3. **Safe next production-read diagnostic prepared, not executed.** `sql/production-reconciliation-counts.requires-approval.sql` goes beyond earlier catalog-only access, so requires explicit approval. It returns discrepancy counts and checkpoint metadata, not user/address/event-payload rows. It has been executed only against isolated synthetic databases to validate syntax/behavior.
4. Added reproducible test commands and no-secret/no-deployment CI steps. No migration moved into the production migration queue. No Solidity source, existing contract address, production policy/secret/data, maker funds, role or trading switch changed.

See [reconciliation runbook](PROJECTION_RECONCILIATION_RUNBOOK.md) and [test runtime](../../protocol/test/sql-runtime/README.md).

## Fresh read-only production observations

### Base checkpoint 52812843

[Evidence](BASE_LAUNCH_STATE_FOLLOWUP.json): one fixed finalized block `0x2c023ecfd19dfe432c3a238a6b49f15f67334e38b927b772cbfcf588d341b015`; all 12 inner read calls checked individually.

- Actual chain ID 8453; native-USDC collateral pointer matches.
- `tradingPaused=true`; `nextMarketId=2`.
- Oracle bond `5000000` atomic USDC, immutable challenge `86400` seconds.
- USDC balances of the six original contracts are zero at this checkpoint.

These are limited getter observations, not fresh six-runtime verification, proof of all liabilities, wallet balances/allowances, market maker liquidity, complete roles, provider truth or full launch readiness. Zero vault balance alone is not a complete CLOB liquidity audit. No mainnet transaction was submitted.

### Sports bindings

[Names/types-only evidence](SPORTS_BINDING_TYPE_FOLLOWUP.json): `tacpredict-app` now has bindings named `FOOTBALL_DATA_API_KEY` and `CRICKET_DATA_API_KEY`, **both `plain_text`, not `secret_text`**. This supersedes earlier absence observations. Compatibility flags include Node process.env population.

The values were not output/logged/committed, and no keys were added/rotated or bindings changed. Plain Text may still make server-side provider calls work; it does not establish API validity/quota/coverage and is not the requested secret-storage type. It is NOT proof the keys were exposed publicly. Conversion of exactly these two existing bindings to encrypted Secret on this worker requires separate production-configuration approval. Preserve other bindings; never put keys in VITE_*, generated JSON, CI output or client code. Review whether historical visibility warrants provider-side rotation; do not rotate silently.

## Verification scope

- Combined transaction-free/PGlite/mocked/config/reconciliation regression: **47/47 passed**.
- Real PostgreSQL suite: **21/21 passed** (includes repeated common SQL/client assertions plus eight concurrency-suite runner tests; do not sum as 68 unique independent cases).
- TypeScript `tsc --noEmit`, Node syntax checks and diff checks passed.
- Fresh FeeV2 local Ganache suite: **15/15 passed**, including additional buyer fee, cumulative rounding, atomic failure, approval/cap/signature boundaries, original-payer VOID fee refunds, duplicate protection, immutable 24h challenge/dispute, non-VOID treasury release and escrow conservation. Compilation occurred locally through the suite. This is not live integration or an independent audit; the six existing Solidity sources remain unchanged and no V2 is deployed.
- Remote PR check-runs query returned zero at inspection; **remote CI is not claimed passed**. PR metadata reports open/draft/unmerged with `mergeable_state=dirty`. Development ref is moving and Git/ref snapshots differ from the PR metadata's base SHA; re-pin/reconcile the exact integration baseline before any merge. No branch merge, base update or release was performed.

The fixtures are not an exact clone of all live production functions/policies. Local tests do not resolve the seven mismatched live function bodies, absent migration ledger, real production ownership invariants or event-history completeness.

## Remaining blockers — not relabeled as complete

| Gate | Current status | Exact next dependency |
|---|---|---|
| Live migration ledger and seven routine mismatches | Ledger absent; mismatches unresolved | Authorized semantic review of current routines / owner provenance; no blind replay or invented migration-history entries. |
| Production historical projections / writer identity | Tool ready; production financial/operational aggregates not read in this checkpoint | Approve aggregate-only diagnostic, pin deployed writer/checkpoint and canonical finalized scope; then separately authorize any private snapshot export if needed. |
| Historical repairs | No repair attempted | Independently verified discrepancy evidence, bounded tested repair and explicit approval. No automatic receipt-marker insertion, data rewrite or cursor rewind. |
| Exact-production-shape staging E2E | Source-derived PostgreSQL tests passed; full staging/wallet/provider/indexer E2E not complete | Approved nonproduction environment/current metadata and bounded fixture/wallet plan. Existing Supabase project must not be replaced. |
| Access/atomic SQL patches | Tested locally, **not applied** | Review current live schema fingerprints, lock/writer quiescence and external compatibility; obtain specific migration/policy approval. |
| Sports key storage / provider validity | Both bindings present as Text; API health unverified | Explicit two-binding Secret-conversion approval and approved bounded health/quota check. |
| FeeExchangeV2 | Separate undeployed prototype; local escrow/refund/release tests are not full integration | Finish versioned schema, canonical receipt/fee indexer, backend/order-domain/UI/approval/refund lifecycle integration; independent security review and testnet E2E before deployment approval. V1 remains fee-free; Pool economics must not be substituted. |
| Liquidity and operations | New funding/approvals/signers intentionally not activated | Real reviewed CLOB inventory/orders, budgets, bounded keeper/creator policy, role/custody verification and explicit wallet approvals. No fake odds or maker funding. |
| Mainnet activation | **Not authorized or performed** | Only after prior gates, exact dependency/version/deployment/fee/allowance/funding/unpause transaction review and separate human approval. |

## Immediate permission request (no deployment request)

The next blocked evidence step is **read-only aggregate reconciliation** on the existing Supabase project. Approval should cover only the supplied reviewed SQL returning counts/checkpoint metadata; it must not authorize DDL, DML, policy edits, user impersonation, raw user/address/payload exports, secret conversion, contract deployment, wallet approval/funding, signer activation, unpause or mainnet transactions. Refresh the finalized anchor before execution.

Do not promise same-day real-money activation before these gates are satisfied. An independent security audit cannot be self-certified by the implementation author or replaced by local tests.
