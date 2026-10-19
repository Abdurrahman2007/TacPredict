# V1 historical projection reconciliation — report only

## Boundaries

`protocol/scripts/reconcile-projection-snapshot.mjs` is an **offline V1-only discrepancy detector**, not a repair/indexer, canonical RPC verifier, balance authority or permission to launch. It has no DB, RPC, signer or transaction imports and never emits SQL repair/checkpoint/receipt-marker instructions. Financial values must be canonical uint256 decimal strings; calculations use BigInt. FeeExchangeV2 and UpDownPool snapshots are explicitly refused.

Input may contain private wallet/position information. Keep it in an approved private workspace; never commit/upload/paste the snapshot into chat. Reports include category counts and opaque scope hashes, not buyer/seller/wallet addresses or payloads. CLI failures are generic and do not echo input. Output uses exclusive-create mode, refusing to overwrite any existing report or the input.

```sh
node protocol/scripts/reconcile-projection-snapshot.mjs --snapshot /approved/private/snapshot.json --report /approved/private/new-report.json
```

Exit 0 = no discrepancies **in supplied evidence**; 2 = discrepancies; 1 = invalid/incomplete input. None means launch approval. All reports explicitly set `canonicalCoverageIndependentlyVerified=false` and `launchAuthorized=false`.

## Required snapshot contract

Top-level fields: `schemaVersion="tacpredict-projection-reconciliation-v1"`, `exchangeVersion=1`, supported `chainId`, decimal-string `deploymentBlock`, and `checkpoint={blockNumber,blockHash}`. Coverage must explicitly assert `fromBlock=deploymentBlock`, `throughBlock=checkpoint.blockNumber`, `includesAllCanonicalProtocolLogs=true`, `includesAllProjectionRows=true`. These assertions cannot be independently established by the offline tool.

Required arrays (maximum 100,000 each; CLI file maximum 20 MiB):
- `canonicalEvents`, `chainEvents`: `txHash,logIndex,blockNumber,blockHash,contractAddress,eventName,payload`; optional per-row chainId must match. Canonical payload must include exact decoded data, including enriched MarketCreated question/condition/hash/token identity from validated contract reads.
- `markets`: `uuid,chainId,onchainId,questionId,conditionId,metadataHash,rulesHash,sourceHash,outcomeCount,openInterestAtomic,volumeAtomic`.
- `outcomes`: `marketUuid,outcomeIndex,tokenId`.
- `trades`: `chainId,txHash,logIndex,marketUuid,buyer,seller,outcomeIndex,priceAtomic,sharesAtomic,usdcAtomic,buyOrderId,sellOrderId`.
- `claims`, `refunds`: `chainId,txHash,logIndex,marketUuid,walletAddress,amountAtomic`.
- `positions`: `marketUuid,walletAddress,outcomeIndex,sharesAtomic`.

Small nonfinancial indexes/counts use safe integers; quantities/prices/IDs/block numbers use decimal strings. The synthetic fixture in `protocol/test/projection-reconciliation.test.mjs` documents exact shapes and must NEVER be treated as production evidence.

## Safe evidence workflow

1. Obtain explicit permission for operational/financial reconciliation reads beyond the prior catalog-only authorization. An optional aggregate-only diagnostic is provided in `sql/production-reconciliation-counts.requires-approval.sql`; it was **not executed**. It returns counts and checkpoint metadata only, not user/address/payload rows. Refresh/review the finalized anchor before execution.
2. Establish deployed writer revision, manifest, actual checkpoints and the finalized block/hash through independently validated read-only sources. A stale DB row is not chain truth; missing raw logs cannot be detected from DB-only joins.
3. Export complete canonical allowed-contract logs/receipts, successful receipt + inner-call evidence and canonical block identities from deployment through one approved checkpoint, with a reviewed RPC request/quota budget. Derive outcome token mappings using the exact deployed contract/formula. Separately export authorized projection rows at the same consistent snapshot. Avoid an unbounded scan against a free RPC provider.
4. Run offline detection. It compares canonical/raw event identity, duplicates/extra rows, market/hash/token identity, trade/claim/refund projections, transfer-derived share inventory, full-set collateral movement and actual executed-notional volume. It does **not** verify complete USDC transfer legs, Oracle bond liabilities, payout backing, legal ownership, external-source truth or later privileged corruption. Do not infer treasury surplus from this report.
5. Independently review each discrepancy. Stop financial activation if any parent, raw event, trade/claim/refund, token map, inventory or collateral mismatch remains. No code here rewinds checkpoints, deletes/replays production events or backfills projection receipts.
6. If a historical repair is necessary, prepare an exact bounded repair plan from independently verified receipts, test it in an approved isolated staging copy, reconcile before/after totals and obtain explicit human approval. New completion-receipt markers must never be written merely to make legacy duplicate calls pass. Quiesce the writer during an approved atomic-guard rollout.

Passing source-derived local tests does not replace this production evidence or an independent smart-contract review.
