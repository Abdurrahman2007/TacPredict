# Separate approval checklist — every box remains unchecked

## Preconditions (not transaction permissions)
- [ ] Independent security/economic reviewer signs off the exact implementation/artifact; unresolved critical/high findings cleared.
- [ ] Actual Base Sepolia deployment and deployed wallet/DB E2E evidence reviewed; local chain receipts are not substituted.
- [ ] Authenticated real crypto/sports source capture, freshness/outage handling and immutable resolution rules verified for each enabled market type.
- [ ] Production SQL/RLS schema/history inspected read-only; staged migration/backup/restore/role isolation rehearsed.
- [ ] Dependency/security findings and monitoring/on-call coverage accepted or remediated.
- [ ] Counsel approves operator disclosures, eligibility, jurisdiction enforcement, privacy and data licensing.
- [ ] User-balance policy approved separately from pool seed budget. No automatic $500 campaign is included.

## Sepolia-only permissions required first
- [ ] User names test wallet/admin, seed/grant caps, private QA wallets/amounts and maximum test-ETH gas budget.
- [ ] User explicitly permits new Base Sepolia deployment and individually reviewed test transactions; no Mainnet use, real USDC or private-key/seed access.
- [ ] Separate authorization for isolated test DB migration/config/indexing writes. No public distribution or old-contract ownership change.

## Each production-impacting action needs a distinct explicit approval
1. [ ] Deploy the **new** virtual engine to Base Mainnet 8453: exact artifact/constructor/admin and max ETH cost; no old-six changes.
2. [ ] Configure roles and finite pool liquidity on the new engine: exact recipients, caps, fees, timings and frozen rules; no arbitrary user balance editor.
3. [ ] Apply the additive production virtual schema: reviewed SQL hash, backup and recovery plan; no destructive migration.
4. [ ] Merge approved PRs / deploy the exact Worker bundle to `tacpredict.fun`: main auto-deploy is production-impacting.
5. [ ] Change production variables/secret bindings: exact names/environment, never disclose values; enabled remains false initially.
6. [ ] Activate continuous virtual indexing, observability, alerting and approved geographic enforcement.
7. [ ] Any balance grant/private canary: explicit allowlist, amount/budget/expiry; public campaigns and $500 distribution are NOT approved by this task.
8. [ ] Enable production trading for named markets/canary and execute wallet E2E under an explicit cost budget.
9. [ ] Publish public launch only after independently verified Mainnet receipts, reconciliation and operational/legal sign-offs.
10. [ ] Emergency pause/resume or recovery transactions on the **new** engine require authorized wallet review; old contracts remain untouched.

The request “live today” is a timing preference, not permission to bypass the above boundaries. Current decision: **NO-GO / not live**.
