# Review-only security and transaction recovery follow-up

Parent: Draft PR #24 (`de33f24afcda81c7cc1d3f01fa3a88fad3801ab7`), itself based on Draft PR #23.
No contracts, production configuration, schema, deployed addresses, secrets or balances changed.
The prediction screen layout/classes are preserved. Recovery controls live inside existing trade details.

## Implemented and locally tested
- Persist exact trade intent before opening the wallet prompt; persist returned/replacement hashes.
- Recover known hashes after navigation/reload and resume authenticated server receipt observation.
- Scope recovery to engine, chain, deployment and wallet. Refuse corrupt/unavailable persistence.
- Use Web Locks plus durable pending records to coordinate same-origin tabs. Unsupported browsers fail closed.
- Unknown send failures do not permit blind retries. Only explicit wallet rejection (4001) releases a no-hash attempt.
- Pending, invalid and reorged observations do not release recovery locks. Reorged receipts keep polling.
- A user can supply a wallet-history hash for recovery. Server must verify a canonical successful receipt and the exact saved wallet/market/outcome/side/input/action nonce before releasing the lock. A hash alone, revert, unrelated trade or API failure cannot do so.
- No local storage value changes authoritative balances or positions. Contract nonces and verified indexed events remain authoritative.
- Patch Vite 8.1.5 -> 8.3.5; version-scoped overrides for ws 8.x -> 8.22.0 and Zod 4.x -> 4.6.6. Preserve Zod 3 / ws 7 API boundaries rather than forcing incompatible majors.
- Make dependency-only changes trigger virtual review CI.

## Evidence classes
- **Source-verified:** unchanged six legacy contracts/manifest, no new signing/deployment scripts, receipt-gated accounting, no real-USDC path in these changes.
- **Locally tested:** recovery storage, wallet provider error paths, contract/indexer/database tests, typecheck, scoped lint, production-mode build with placeholder local-only configuration.
- **Remote CI-verified, parent PR only:** PR #24 virtual-local and local-validation both completed successfully. See GitHub job links in validation JSON. Not deployment evidence.
- **Unverified:** deployed Sepolia/Mainnet virtual engine, live wallet browser E2E, production DB/RLS application and continuous virtual indexing. No new network transaction was sent.

## Remaining findings / limitations
| Severity | Finding | Mitigation / remaining gate |
|---|---|---|
| High, dependency advisory | Zod 3 remains in application/wallet dependencies; npm reports 17 high dependency entries after patch. Entries are not 17 independently proven exploitable bugs. | Review reachability and migrate compatible dependencies with wallet regression tests before approving public launch. Do not blanket-force Wagmi/Zod major upgrades. |
| Moderate, dependency advisories | Root audit still reports 21 moderate entries including nested stream-json 1.x, uuid, decode-uri-component and development esbuild. | Target upstream-compatible wallet/build dependency upgrades; no claim all advisories eliminated. |
| Critical/high, legacy development dependency advisories | Unchanged legacy `protocol` install reports 36 entries: 5 critical, 23 high, 6 moderate, 2 low. This is separate from the zero-advisory new virtual toolchain and is not proof of 36 exploitable production paths. | Keep legacy Ganache/compiler tools isolated; review and replace affected development dependencies separately without changing the six deployed contracts or compiler/artifact assumptions. No audit-clean launch claim. |
| Medium, liveness | Reload during an unresolved wallet prompt, cancellation/replacement without a matching TradeExecuted, or permanent browser storage loss can require operator reconciliation. | Keep fail-closed lock. Exact-intent successful transaction recovery is implemented. A safe cancellation-proof/expiry recovery workflow remains outstanding; never delete a lock solely because time elapsed or a user pasted a reverted hash. |
| Operational | Web Locks/localStorage support required; storage is only same-browser coordination, not cross-device consensus. | Contract nonce/revision validation and on-chain receipt/index reconciliation prevent double execution. Test target wallet in-app browsers before release. |
| Release gate | No actual Sepolia deployment or remote DB integration evidence. No independently approved economic/security review. | Obtain separately scoped wallet/transaction/DB permissions and run staged deployed E2E. Virtual credits do not eliminate ETH gas costs. |

## Validation and rollback
See `recovery-validation.json`, `recovery-test-results.txt`, and `recovery-dependency-audit.json` for actual commands/results. Repository-wide lint has existing failures; scoped touched virtual TypeScript lint is clean.
Review changes as a stacked Draft PR against `review/virtual-launch-hardening`, not main. To discard before deployment, close the Draft PR/delete its review branch; no chain/database rollback is needed. If later approved and merged, revert the review commit through a reviewed PR and retain pending records for reconciliation. Never weaken nonce, receipt or balance checks to work around a recovery lock.

## Inputs/approvals still required
1. Public administrator/test wallet addresses (never private keys/seed phrases).
2. Explicit permission for Base Sepolia deployment/test transactions and a maximum test-ETH gas budget; approved finite pool/grant caps and private QA allocations. No automatic $500/public campaign.
3. Isolated staging DB/config/indexing-write permission and deployment credentials through secure configuration, not chat.
4. Real market source access/licensing and immutable resolution policies; legal/security reviewer sign-off.
5. Production actions remain individually gated by FINAL-APPROVAL.md. No Mainnet deploy, production merge/migration/config change, funding, ownership change or trading activation has been authorized by this follow-up.
