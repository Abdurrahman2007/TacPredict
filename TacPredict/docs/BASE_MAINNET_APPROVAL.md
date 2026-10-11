# Base Mainnet deployment — approved and mined, trading paused

- Network: Base Mainnet, chain 8453. Public markets remain Mainnet-only.
- User-confirmed on-chain administrator: `0x57828f1aa32fd6be3988f240068df53ed94b7aef` (Base Account).
- Existing native USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- Six contracts: Registry, Oracle, Factory, Positions, Exchange, Settlement. USDC is not redeployed.
- Nine atomic Base Account calls prepared: six deterministic deployments, Registry FACTORY_ROLE / ORACLE_ROLE grants, then `pauseTrading(true)`.
- The public deterministic deployment proxy at `0x4e59b44847b379578588920cA78FbF26c0B4956C` was checked against its exact published minimal CREATE2 runtime on Base. This is a target-address deployment mechanism; the MCP does not expose bare CREATE.
- Constructors explicitly assign the confirmed admin, not the proxy. Salts/init-code hashes and predicted addresses are retained in the private operator workspace plan, not registered as real deployments.
- Initial Oracle parameters in the prepared batch are 5 USDC bond and 86,400-second challenge period. These must be reviewed before signing; constructor settings are not casually adjustable afterwards.
- A read-only simulation of the full smart-account `executeBatch` passed. Estimated execution gas was 7,856,243; execution-only estimate at the observed gas price was 0.000047137458 ETH. Base L1 data fees and account-abstraction overhead are additional. Estimates are not guarantees or a payment quote.
- The owner funded gas and approved the batch in Base Account. Transaction `0x2b707200f70fb3d9c7598605f3d7cf57a05bded84842742b362004e82b4a0966` succeeded in block 52453630. The account UserOperation also succeeded; its actual gas charge was 0.0000554915205 ETH.
- Deployment is not activation: trading remains paused and database `verified` is now true after finalized deployment/source/runtime/role checks, while `trading_enabled` stays false pending independent review and an explicit launch decision.
- Sixteen isolated contract scenarios pass, but these are not an independent audit or exhaustive fuzzing. Real funded Mainnet trading/settlement/claim E2E has not run.
- App `/admin` access is separate from on-chain roles. The explicitly requested, existing verified login account has been granted the admin role in the main Supabase project. No new account or wallet ownership link was fabricated.

Finalized source/role verification succeeded through block 52453800; the main database record is verified and trading remains disabled. Next: confirm real finalized indexer checkpoints and separately review launch readiness. No production market or financial event should be fabricated while waiting.

## Operational validation

The requested existing app administrator is assigned; all six runtime hashes, pointers, bootstrap roles and finalized canonical receipts matched. Mainnet registration is verified with trading disabled. Cloudflare cron is being changed to a bounded one-minute schedule for free-tier limits. A real bounded indexer run succeeded and persisted checkpoint 52453985; initial RPC-limit failures are retained in private run logs. The public dRPC endpoint is replaced by a dedicated server-only Alchemy Base endpoint. Ten-block ranges and six bounded chunks respect free-tier limits; neither free RPC nor the free Worker is a production SLA. Independent audit, first native market terms/liquidity, operational monitoring and real funded trading/settlement/claim E2E still remain.

All six sources are now publicly verified on BaseScan and Sourcify (see `protocol/deployments/base-mainnet.sources.json`). Runtime/role verification and public source matching are not independent audits. Automatic observation can prepare reviewed unsigned evidence; autonomous signing/submission is not enabled. The operator admin interface is Base Mainnet-only.

## Finalized indexer recovery — observed 2026-10-11

Dedicated Alchemy Base RPC backfill reached finalized block 52457059 with `done: true` and persisted that exact checkpoint in the main Supabase database. After bootstrap released its fencing lease, the deployed Worker independently reported `SUCCESS`, `done: true`, and checkpoint 52457059 on the actual one-minute cron (`* * * * *`), including consecutive observations at 07:47 and 07:48 UTC. This is observed execution, not merely schedule configuration. Future finalized blocks continue through the same bounded, idempotent indexer; this does not constitute a throughput SLA for populated markets.

The two old 07:10/07:15 jobs that exhausted the previous Free Worker subrequest budget were accurately marked FAILED, with finish timestamps, only after confirming no active indexer lease. Their IDs remain in audit history: `10e0ddca-bf14-4892-9303-7a149e7b9b3a` and `e97dee8f-1a6e-454f-bb5f-aedf8d9b1fed`. No financial records were fabricated or removed. Diagnostic observability sampling was restored to 10%, with query-string redaction retained. Temporary local RPC credential material was removed.

There is still no native market, native USDC collateral in the confirmed administrator wallet, or real funded Mainnet Exchange/Oracle/Claim E2E. Source verification is not an independent audit. A small real test needs explicit terms, wallet approvals, collateral and the immutable 5 USDC oracle bond; finalization must respect the immutable 24-hour challenge window. Public trading remains paused.
