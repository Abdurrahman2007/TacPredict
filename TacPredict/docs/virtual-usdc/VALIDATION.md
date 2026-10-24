# Phase 1 validation — existing baseline only

Classification: **Locally tested (LT)**. Machine-readable summary and preserved source fingerprints: baseline-evidence.json. This is not an independent security audit or a test of a new virtual engine.

| Command/check | Result |
|---|---|
| Fresh main checkout | 2da5ae195cec916206e217ca71182b1baa8c39f7 |
| npm ci --ignore-scripts (app + protocol) | Completed locally; no dependency updates committed |
| npm run typecheck | PASS |
| npm run compile --prefix protocol | PASS; all existing contracts compiled locally |
| npm test --prefix protocol | **166 tests passed, 0 failed**, 614174.274881 ms; includes real-collateral contract scenarios on isolated local chains, not real Mainnet funds |
| npm run build | PASS using synthetic non-secret local Supabase URL/key placeholders; not evidence of production configuration or live API success |
| npm run lint | **FAIL: 496 errors, 19 warnings**; unchanged baseline, errors reported as formatting/Prettier; no broad auto-fix applied |
| npm audit --json (app lockfile) | 35 advisories: 33 moderate, 2 high, 0 critical; high advisories include vite and transitive ws; reachability/exploitability not established |
| Existing six Solidity source hashes | Match audited HEAD exactly |
| Production actions | **None** |

Ganache reported an optional native uWS binary mismatch under Node 24 and used its NodeJS fallback. The full suite still completed successfully. Test output fields such as mainnetDeployed:false describe the isolated scenario, not the historical existence of the six Mainnet deployments.

Build generated a local favicon artifact; it is excluded from the review commit along with all node_modules, .output, .wrangler, artifacts, logs and environment material. Existing user worktrees were not reset or overwritten.

## Not tested / not implemented in Phase 1

No new 500-unit grant contract, virtual Buy/Sell, virtual settlement, new indexer/RLS migration, points computation, paymaster, relayer or admin virtual screen has been implemented. Consequently none is claimed tested, ready, live, secure or deployed. The scenario matrix in IMPLEMENTATION_GATES.md is a future acceptance plan, not a passed test list.

No testnet transaction, Mainnet transaction, production migration, secret change, treasury transfer, old-contract role/pause/activation change, or deployment occurred. The review branch must remain unmerged; main pushes trigger production deployment.

## Source evidence index

- package.json, protocol/package.json; src/lib/web3/config.ts; src/components/providers/wagmi-base-bridge.tsx.
- protocol/contracts/{MarketRegistry,MarketFactory,ConditionalPositions,Exchange,ResolutionOracle,Settlement,UpDownPool}.sol.
- protocol/deployments/base-mainnet.json and .verification.json (historical/source records only).
- src/lib/protocol/execution.ts; orders.server.ts; wallet-link.server.ts; admin.functions.ts; admin-dashboard.server.ts; src/lib/ranking/core.mjs.
- protocol/scripts/indexer-core.mjs, job-client.mjs, request-budget.mjs, compile.mjs.
- supabase/migrations/202610080004_native_usdc_protocol.sql; 202610080010_verified_wallet_links.sql; 202610080014_protocol_job_fencing.sql; 202610110017_market_import_agent.sql, plus later additive migrations through 0020.
- src/lib/pool/deployment.ts, pool-client.ts, pool.mjs; src/lib/updown/window.mjs; src/lib/protocol/market-templates.mjs; src/lib/sports/fixtures.mjs.
- database/accounts.sql; src/lib/accounts/worker.mjs; src/lib/prediction-wallet.tsx.
- scripts/package-cloudflare.cjs; scripts/prepare-workers-deploy.cjs; .github/workflows/deploy-cloudflare.yml (repository root).
- ERC-4337, EIP-5792, EIP-1153 specifications were retrieved for semantic review. No live sponsorship provider/capability or Base transient-storage support is inferred from retrieval.
