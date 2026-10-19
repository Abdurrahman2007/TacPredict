# Stage 3 — authorized aggregate reconciliation and review-only integration fixes

**Release blocked. PR #3 remains draft/unmerged. No production deployment, database/schema/policy/secret modification, activation, fund transfer or mainnet transaction.** The owner's continuation approved the immediately preceding read-only aggregate reconciliation request; it is not blanket transaction or withdrawal authority.

## Production-verified observations

Existing project: `lmqaiqvwcytmgwgwyfwx`. The authenticated SQL editor ran two explicit `BEGIN TRANSACTION READ ONLY` diagnostics, each with a 30-second statement timeout. Only aggregate counts, catalog presence and checkpoint metadata were returned. No user/address/event-payload rows were retrieved. Sanitized results and exact query SHA256 values: [SUPABASE_LIVE_AGGREGATE_RECONCILIATION.json](SUPABASE_LIVE_AGGREGATE_RECONCILIATION.json).

| Observation | Verified result | Interpretation / limit |
|---|---|---|
| DB checkpoint | Base block `52756118`, hash `0x2b274e57d8c42772fee61db6daf34a3d642c0d9f6a25a3736683d3be6322d58a` | Its hash matched a separate exact-block RPC read. This does not establish every historical log was indexed. |
| Finalized anchor for the query | `52813606` from Multicall3 `getBlockNumber()` at `finalized` | Separate read-only RPC observation, not proof of all logs. |
| Lag at that anchor | **57,488 blocks** | The checkpoint's recent `updatedAt` is NOT evidence of caught-up indexing. |
| Raw events | **2**: one `MarketCreated`, one `MetadataPublished` | Tiny indexed prefix; no financial activity demonstrated. |
| Market projection count | **1** | Does not independently prove all canonical markets were discovered. |
| Trade / principal claim / principal refund projections | **0 / 0 / 0** | Zero mismatch results for these are vacuous for real financial activity. |
| Missing parent/trade/redemption projections and tested trade/redemption mismatches | **0** within the bounded indexed prefix | NOT a claim of complete historical reconciliation, backing or user isolation. |
| Orphan trade projections | **0** within the diagnostic's transaction/checkpoint bound | Does not cover unindexed canonical events. |
| Bound native wallets without `verified_at` | **0** | Snapshot aggregate invariant only; the missing restrictive RLS predicate still needs correction. |
| Indexer job records, last 24h | **1,439 SUCCESS**, **1 FAILED** | SUCCESS means a bounded batch completed, not caught-up financial truth. Failure cause not read/established. |
| Standard migration ledger | Still absent | Do not fabricate applied versions or create a retrospective ledger as proof. Seven prior function-body mismatches still require provenance review. |

The earlier catalog findings remain recorded in [LIVE_SUPABASE_FINDINGS_AND_REVIEW_FIXES.md](LIVE_SUPABASE_FINDINGS_AND_REVIEW_FIXES.md). Zero currently unverified bindings do not make permissive policies safe. Production user-A/user-B mutation/proof tests were NOT run.

## Review-only code corrections completed in this continuation

1. **Full event/receipt envelope guard in the actual V1 indexer path.** Check canonical block number/hash and finalized bound; receipt status, tx hash/index and block number/hash; exactly one matching receipt log index; log emitter/data AND every topic; log tx/block envelope and removed flag. Reject logs outside the requested chunk. Reject checkpoints beyond finalized head. Validate the chunk-end block before checkpoint advancement. An emitted event supports that event only; outer receipt success is never treated as proof that every inner bundle operation succeeded.
2. **Strict lease acknowledgements.** Only boolean `true` acquires/renews writer authority; malformed truthy strings/objects/numbers reject. `false` acquisition remains a safe skip; failed renewal records failure and releases the lease.
3. **Honest bounded-run status.** Return `lagBlocks` as an exact decimal string and change source Worker logging to `CAUGHT_UP` only when `done===true`; otherwise `CATCHING_UP`. The existing DB enum `SUCCESS` remains batch success, not a launch gate. No production Worker was updated.
4. **Separate FeeV2 typed-data/disclosure boundary.** Exact V2 wire fields and canonical integer strings; chain/address/market/outcome/time/fee-recipient/debit-consent validation; distinct `TacPredictFeeExchange` / version `2` domain; explicit rejection of the known V1 mainnet Exchange address. Recompute buyer fee with cumulative integer 100-bps rounding before disclosure. Return `executionAuthorized:false`; no wallet signing, approvals, RPC, order persistence or execution wired in. V1 signatures and fee-free V1 fills remain unchanged.
5. **Local tests.** Receipt substitution tests hit actual indexer orchestration and assert no projection/checkpoint writes occur. Lease malformed-ack tests and V2 wire/disclosure tests are in the no-secrets suite. The isolated EVM fee suite compares the new parser's digest against Solidity `orderId()`. Both executed aggregate SQL variants are also compiled/run on synthetic SQL fixtures.

## Source-only catch-up explanation — not a verified live root cause

Reviewed source packages the scheduled indexer with `maxChunks=6`, `chunk=10` and a 48-request Worker budget: at most 60 blocks per invocation before event cost/request limits. The source has one-minute indexing and a separate fifteen-minute discovery schedule. The actual deployed revision, missed invocations, provider rate limits, failure cause and current throughput are not proven by the aggregate counts. Do not infer full production provenance from this source alone.

**Do not “fix” lag by setting the checkpoint to head, inserting completion markers, skipping missing projections, removing lease checks, raising Worker request limits blindly, or executing a signer.** No indexer job was manually triggered here: it writes projections/checkpoints and requires separate operational approval.

## Required catch-up / historical reconciliation procedure

1. Establish current deployed revision, provider limits and remaining budget through sanitized metadata; preserve the existing checkpoint and indexer leases. Reconfirm the standard migration-ledger absence and review the seven differing function bodies before any schema rollout.
2. Reproduce the live schema/policies and relevant function versions in an authorized isolated staging environment; source-derived PGlite/PostgreSQL tests are useful but are not an exact production replica or independent audit.
3. Review the existing privacy/atomic-guard SQL proposals together with live applicability, statement-level changes, backup/rollback and client compatibility. Apply nothing without an explicit bounded production-change approval. A transaction that fails its body-hash precondition must stop, not bypass the precondition.
4. For historical recovery, obtain approval for a narrowly scoped private normalized snapshot and independent canonical receipts/logs, including a reviewed RPC range/request budget. A zero-row mismatch count is not a coverage certificate. Use the [offline reconciliation runbook](PROJECTION_RECONCILIATION_RUNBOOK.md); do not post wallet/payload exports in a PR/chat.
5. Approve a bounded **read-chain/write-projection-only** catch-up operation separately, with existing fencing, finalized receipts, verified code/config and stop-on-discrepancy. No matcher, signer, orders, fills, treasury or role changes. Resume from the last committed checkpoint; do not jump or erase it. Reconcile after catch-up before considering activation.

## FeeV2 and launch work still incomplete / explicitly gated

- Versioned exchange-instance registry, backend order storage/verification (including ERC1271 and proven wallet ownership), full fee-event pairing/transfer reconciliation, atomic database projection/reorg handling and production frontend lifecycle are **not complete**. New pure parser/disclosure functions are not production integration.
- V2 is still undeployed. Six existing contracts, old approvals/signatures and principal redemption paths are unchanged. Existing V1 cannot be made fee-bearing by a UI label.
- Independent contract review and actual approved staging/testnet E2E are still required. Local Ganache success is not either.
- Guaranteed VOID execution-fee refunds require escrow until actual terminal result. Treasury release is actual RESOLVED non-VOID only; immutable 24-hour Oracle challenge remains. No early payout, arbitrary refund or collateral surplus sweep is introduced.
- Last verified sports binding types were **Text/plain_text**, not encrypted Secret. Provider health/coverage/quota is unverified. Converting exactly those two bindings is a separate production-config change; values must enter through a secure secret mechanism, not chat/code/logs. Preserve every other binding and do not silently rotate.
- Preserve newer UI / separate UpDownPool economics. Resolve the moving development baseline, merge conflicts and actual CI before rollout. Do not blindly merge and call another economic model FeeV2.
- No mainnet trading activation, contract deployment or funding approval is being requested based on this report.

## Next narrowly scoped decisions

The aggregate-only read permission has been used and does not need to be requested again. Next approvals, when the prerequisites above are met, must identify exact targets, permitted writes, rollback and budgets:

- **Config:** exactly `FOOTBALL_DATA_API_KEY` and `CRICKET_DATA_API_KEY` Text-to-encrypted-Secret conversion on production `tacpredict-app`; no other secrets/config/deploy/trading changes.
- **Staging / evidence:** authorized existing-project isolated staging access or approved private production-shaped metadata/snapshot export, with data minimization and no production mutations.
- **Projection recovery:** exact catch-up/reconciliation write scope and RPC budget, only after reviewed fail-closed rollout prerequisites. No financial transaction/signing authority.

No blanket “approved” should be interpreted as a budget, key-custody decision, independent audit, collateral approval, real-market creation, unpause or withdrawal authorization.

## Fresh local validation checkpoint

- `npm --prefix protocol test`: **74/74 runner tests passed**, zero failed/skipped; 246.3 seconds. Includes the 32 focused guard/order tests (not additional unique cases).
- PGlite security SQL: **13/13 passed**; actual executed aggregate query variants also run on synthetic fixtures.
- Real PostgreSQL 17.9 security SQL/concurrency: **21/21 passed**, including overlapping common SQL tests. This is not the live 17.11 database or an exact production clone.
- FeeV2 local Ganache/Solidity suite: **15/15 passed**; 166.8 seconds. The new parser digest equals local Solidity `orderId()` in the consent/domain case. No real-chain deployment or assets.
- TypeScript noEmit, Node syntax checks and `git diff --check` passed. Formatter applied. A production application build was not rerun in this continuation.
- FeeV2 suite is now explicitly included in the review-only, no-secrets local CI workflow. At the last remote check, GitHub reported **zero check runs**, not CI success.
- Native Ganache µWS module was unavailable under Node 24 and fell back to JavaScript; test failures: zero. No residual local PostgreSQL process was observed after runner cleanup.

Machine-readable validation: [STAGE3_VALIDATION.json](STAGE3_VALIDATION.json). Counts overlap as described; no inflated combined total is claimed.
