# Validation scope and results

Machine summary: `validation.json`. These are local results and read-only public chain observations, not production readiness approval.

| Check                                                                         | Result                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Virtual contract/backend/indexer/RLS/pending/reorg/points/compatibility suite | **71 passed, 0 failed** (`virtual-tests.log`)                                                                                                                                                                     |
| Dedicated new price engine + new-engine SQL indexer E2E                       | **12 passed, 0 failed**; separate local transaction receipts/events in `local-price-transactions.json`                                                                                                            |
| TypeScript                                                                    | exit 0 (`typecheck.log`)                                                                                                                                                                                          |
| Production-mode build                                                         | exit 0; generated output only, **not deployed**                                                                                                                                                                   |
| Changed TypeScript lint                                                       | 0 errors, 1 existing hook dependency warning (`scoped-lint.log`)                                                                                                                                                  |
| Full repository lint                                                          | **469 errors / 19 warnings**, baseline **496 / 19**. Not a clean lint gate; `full-lint-summary.json`. No blanket suppression added.                                                                               |
| Broad existing regression sweep                                               | Initial 211 tests: 206 pass / 5 fail. Four obsolete real-trading/XRP expectations repaired.                                                                                                                       |
| Final non-long-chain regression sweep                                         | 209 tests: **208 pass / 1 pre-existing failure** (`legacy-final-fast-tests.log`)                                                                                                                                  |
| Long legacy chain files                                                       | `protocol.test.mjs` and `updown-pool.test.mjs` passed in the broad sweep; unchanged after assertion repairs. Split final coverage = 210 pass / 1 known baseline failure, **not a fresh single clean full sweep**. |
| Remaining regression failure                                                  | `world-market-ui.test.mjs`: expects a `/rewards` header link absent on baseline too. Reproduced in unchanged worktree (`baseline-navigation-test.log`); no navigation redesign to satisfy obsolete expectation.   |
| Visual                                                                        | Disconnected portfolio: 390x844 + 1280x900 matched recorded geometry; no page errors or horizontal overflow. Connected prediction/wallet visual regression still unverified.                                      |
| New public network deployment                                                 | **None**; no Sepolia/Mainnet deployment or new network trade in this task.                                                                                                                                        |

An initial parallel compile/build/test attempt was resource-killed (typecheck exit 137 and an interrupted contract worker), not accepted as a pass. Serial reruns completed typecheck/build and the full 71-test virtual suite. Node 24 Ganache µWS binary mismatch falls back to JavaScript; legacy chain files completed despite this warning. Local test hashes cannot be looked up on Base explorers and are not presented as Base network evidence.

Reproduce commands in RUNBOOK.md. For explicit new-engine local transaction capture:

```sh
VIRTUAL_PRICE_EVIDENCE_PATH=/tmp/virtual-price-local.json node --import tsx --test --test-concurrency=1 protocol/virtual/test/price-contract.test.mjs
```

The full repository lint failures, baseline navigation assertion, fast oracle/cadence blocker, external economic/security review, hosted RLS/auth/wallet/operator E2E and production observability remain open gates. No claims of full testnet validation, independent audit or live public trading.
