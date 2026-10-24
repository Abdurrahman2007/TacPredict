# Virtual USDC launch runbook — DRAFT / NO-GO

This is a deployment-preparation document, **not permission to execute**. No Mainnet deployment/transaction, production merge, migration, configuration, wallet/key access, grant, campaign or trading activation was performed. PR #23 is still draft/unmerged. This follow-up branch is also review-only.

## 1. Verified state and checklist

| Item | Evidence / current outcome |
|---|---|
| Six Mainnet contracts preserved | Source safety test and read-only RPC at block 53014967; all six hashes match `base-mainnet.json`; see `mainnet-readonly.json`. This is not an audit of those contracts. |
| Current PR/source | PR #23 head `80be72e`, main `2da5ae1`; no merge. New branch builds on PR #23. |
| Site infrastructure | Cloudflare `tacpredict-app`, domain Worker routes `tacpredict.fun/*` and `www.tacpredict.fun/*`. Current version/config metadata in `infrastructure-readonly.json`. |
| Virtual production config | Not present in observed Worker binding names; no virtual deployment or activation was configured. Secret values were not read/exported. |
| Existing schedules | One-minute and fifteen-minute legacy jobs, **not a virtual indexer**. New operations command is dormant; do not assume existing cron indexes the new engine. |
| Local contract/backend validation | Reproduced with a Cancun EVM and disposable PostgreSQL; see final `validation.json`. Local receipts in `local-receipts.json` are **chain 31337, not Sepolia**. |
| Database access policies | New draft tested under authenticated/anonymous roles. Current production SQL schema, applied migrations and role grants **not remotely verified**; no authorized production DB connection used. |
| Production observability | Worker settings returned no observability object; actual log retention/alerts not verified. New structured metrics/health checks are implemented, not scheduled or operationally commissioned. |
| Sepolia deployment | **Not performed**: user prohibits spending/signing. `sepolia-status.json` contains no fabricated address/hash. |
| Data providers | Frozen source-policy and captured-evidence validators tested; actual provider authentication, history coverage, SLA, fixture/results and freshness recovery **not certified**. No market approved for launch. |
| Browser/wallet E2E | Local contract/backend E2E only. Actual deployed wallet confirmations, replacements, mobile navigation and network switching remain unverified. |
| Public balances | No $500 campaign or public distribution. All new users start at zero unless a separate finite grant is authorized. A public trading launch cannot be advertised as usable without an approved balance-allocation policy. |
| Legal | Updated virtual-only disclosure draft. Counsel review, operator identity, applicable jurisdictions/privacy/geo enforcement remain release gates; see `LEGAL-GATE.md`. |

## 2. What changed after PR #23

- **High, fixed:** quote key omitted market ID. Different markets with identical wallet/amount/outcome could reuse a quote; the card now has market-scoped keys plus a final exact-intent guard before submission. Tests vary every intent dimension.
- **Medium, fixed:** an old but canonical index checkpoint could serve new orders. New quotes fail closed when checkpoint age exceeds configured `maxProjectionAgeSeconds` (120-second conservative engineering default, configurable 1–3600). Wallet, shares and basis still reconcile to chain. This is an operational threshold, not a reward/eligibility policy.
- **Medium, fixed:** nullable SQL expected cursor could evade sequential-CAS comparisons. Null/fractional cursor/timestamp/event data now reject; rewind/finalize reject null numbers. RLS remains unchanged.
- **Medium, fixed:** a mined receipt disappearing could be labeled pending. Prior mined observations now become reorged and retain the old block evidence for investigation.
- **Medium, mitigated:** provider exception messages could contain credential-bearing URLs. Server functions now expose enumerated safe messages only. Structured indexer logs omit URLs, tokens and raw exceptions.
- **Medium, fixed:** no expected gas estimate in the card. Quotes now simulate/estimate execution gas and show ETH cost at observed gas price, explicitly **excluding additional Base L1 data fees**. Wallet full fee review remains required.
- **Medium, mitigated:** missing resolution-source policy. Quotes now require an immutable-metadata source specification; crypto asset/interval/boundary tolerance/tie and sports fixture/draw policies are validated. Captured-evidence validation rejects wrong, stale, future, non-final or abandoned results. **Validation is not provider authentication and does not autonomously resolve a market.**
- Added conservation/finality/pause/indexer health, a dormant CLI, read-only Sepolia source/deployment/receipt verifier, local receipt evidence and no-deployment CI. Updated the regression assertion for the seventh, isolated Virtual Trading navigation entry; the previous six-entry assertion caused PR #23 CI to fail.
- User-facing terms now distinguish virtual losses from real native-ETH gas costs. No real-USDC entry/exit path, grant amount, ownership or market rule was added/modified.

## 3. Environment and minimum permissions

Never print values or put them into a PR, report, client bundle or chat.

| Name | Location / purpose | Minimum access |
|---|---|---|
| `VIRTUAL_TRADING_CONFIG` | Server-only JSON; `{chainId,engine,codeHash,startBlock,enabled,markets,maxProjectionAgeSeconds}` | Config read for application; separately approved editor for isolated environment only. Production remains absent. |
| `VIRTUAL_RPC_URL` | Server-only Base/Sepolia HTTPS read RPC; may contain credentials | Read calls only; timeout/retry policy in runtime. No account/key or write RPC needed. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server-only existing client for namespaced projection/audit tables | Dedicated isolated Supabase project recommended. Service key can bypass RLS: treat it as highly privileged; no frontend exposure. New SQL RPCs are service-only. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Public app client/auth configuration | Publishable values only; NEVER service key. |
| `VITE_WALLETCONNECT_PROJECT_ID` | Existing wallet connector | Restrict domains in provider console after approval. |
| `VIRTUAL_OPS_INDEX_APPROVED` | CLI database-write gate; exact `true` only for approved indexing environment | Not a signing permission. `health` is read-only; `index` writes namespaced projections/checkpoints. Do not set for production during this task. |
| `VIRTUAL_TESTNET_RPC_URL` | Optional read-only RPC for verifier | Base Sepolia only; defaults to public Sepolia endpoint for small smoke checks. |
| `VIRTUAL_LOCAL_EVIDENCE_PATH` | Local tests only | Output path for local public receipts, not a secret. |

No relayer key, deployer private key, seed phrase, paymaster, real-USDC allowance or gas-sponsorship secret is needed by this code. Blockchain signing belongs to the user's wallet only, after distinct approval. App admin requires assigned DB admin role + MFA; it cannot bypass contract roles. New contract creator/guardian/proposer/watcher/arbiter are separate from app roles and from one another; preserve all old contract ownerships.

## 4. Reproduce validation

From `TacPredict/`, Node 24:

```sh
npm ci
npm ci --prefix protocol
npm ci --prefix protocol/virtual
npm --prefix protocol/virtual run compile
VIRTUAL_LOCAL_EVIDENCE_PATH=/tmp/virtual-local-receipts.json npm --prefix protocol/virtual test
npm --prefix protocol test
npm run typecheck
npx --no-install eslint src/lib/virtual src/components/virtual src/components/admin/views/virtual.tsx src/routes/terms.tsx
npm run lint
npm run build
```

Use local/disposable Supabase values for build. Full-repo lint has an existing formatting backlog; record failures, never suppress them globally. Root/protocol dependency advisories are separately recorded in `validation.json`; local pass does not waive these findings. The new CI workflow runs only local checks and contains no deployment credentials or activation step.

## 5. Sepolia approval gate and procedure

**Minimum permission still needed:** authorize an isolated Base Sepolia test deploy and subsequent individually reviewed wallet transactions using **test ETH only**, no Mainnet use, no public grants, no ownership change to any old contract, no private-key access. User must identify the test wallet/admin, finite test seed/grant caps, test recipients/amounts and a maximum test-ETH gas budget. Estimate all transaction fees before each signature; if over budget or network differs, stop. Zero real USDC is required. Do not infer a grant amount or a $500 campaign.

1. Pin/review the implementation commit and independent audit findings. Choose test-only admin and constructor caps. `prepare-testnet.mjs ADMIN SEED_BUDGET_ATOMS GRANT_BUDGET_ATOMS` produces unsigned chain-84532 creation data; see parent README. Nothing broadcasts automatically.
2. The user deploys through an approved wallet after reviewing chain, constructor and maximum gas. Record address, creation transaction and block. All six Mainnet contracts remain untouched.
3. From the app directory, use the read-only verifier:
   `npx --no-install tsx protocol/virtual/scripts/verify-sepolia.mts evidence-input.json`.
   Input fields: `engine,deployTx,admin,seedBudgetAtoms,grantBudgetAtoms,trades`. Each trade has `hash,wallet,marketId,outcome,isBuy,input,nonce`. Ordinary direct contract-creation deployment is supported; smart-account factory deployment needs a separately reviewed creation-proof extension, not a fake EOA receipt.
4. The verifier requires successful canonical source-matching deployment/constructor bytecode (immutable slots normalized and budget getters checked), correct new admin, matching receipt/event and unique hash for each Buy/Sell. It emits `sepolia-verification.json`; `completeTradeSmoke` must be true. This is not an audit or market-data certificate.
5. Separately approve role grants on the **new Sepolia engine**, one test pool with frozen metadata/rules/source specification, and a small **private QA grant only** through a finite allowlist campaign. No public campaign or automatic signup grant. Pool seed and user grant budgets remain separate; no individual balance editor.
6. Review/apply the SQL draft to an isolated test project. Baseline prerequisites must be verified first. Register the deployment with checkpoint/finalized `startBlock-1`, null hashes. Use schema-only review/backup and least privilege; no production migration.
7. Configure isolated app environment, initially `enabled:false`. Verify code hash/chain/metadata, then authorize **test-only** flag and test-wallet use. Run bounded indexing:
   `VIRTUAL_OPS_INDEX_APPROVED=true npx --no-install tsx protocol/virtual/scripts/operations.mts index`.
   Poll health separately. Operators must keep indexer lag below configured threshold.
8. Test actual wallet Buy/Sell (distinct receipts), partial/full exits, rejection, replacement/cancel, insufficient ETH, simultaneous quotes, reload/navigation after pending transaction, pause, finalization/dispute/void, settlement while paused and RPC outage/recovery. Save input fixture, raw public receipts, block hashes, expected events and reconciled DB state. Include 5m/15m/30m/1h/12h/24h crypto and relevant football/cricket source fixtures before enabling those categories.
9. Have a second reviewer compare captured official raw data with normalized evidence and the committed rules hash. A URL/hash supplied by an operator is not authenticated proof by itself. If a price boundary or official fixture/result is unavailable, **do not publish/resolve**; follow immutable challenge/deadline/void rules. Never use AI as an outcome authority.

## 6. Production preparation (commands are NOT authorized now)

After Sepolia, legal/data/security/DB gates pass, submit a distinct production approval package containing exact commit/source hash, audited artifact, new deployment/admin/roles, finite caps/fees, immutable market metadata, provider policy and evidence, proposed grants (if any), schema diff/backups, Worker bundle, runtime/config allowlist, index schedule, monitoring owners and cost caps.

- Pin a Mainnet artifact compiled with the same toolchain; estimate deployment gas using unsigned data. Obtain explicit permission to deploy **only the new engine on 8453**. Never modify the six old contracts.
- Verify new runtime/source/constructor/admin/roles against actual receipt and code, not a pasted address. Keep trading disabled and no public grants.
- Obtain separate production migration approval after staging restore/rehearsal, RLS role tests and row-count/checkpoint backups. Apply additive virtual schema once. No destructive changes/down-migration.
- Obtain production code merge/Worker deploy approval. Existing `deploy-cloudflare.yml` auto-deploys pushes to `main`; **merging is production-impacting**, even if virtual enabled flag is false. This task does not merge.
- Configure only reviewed server variables in a separately approved step; inspect Worker bindings by name, never export secret values. Use a resilient read-only RPC provider with finalized/history support and appropriate rate limits.
- Commission a dedicated protected continuous virtual indexer (not legacy matcher/pool keeper). A supervised operator may repeatedly invoke the bounded `index` command using approved environment/DB credentials; respect DB leases and health thresholds. No public unauthenticated endpoint. 16-block batches are bounded; after catching up, poll against chain head. A stale checkpoint blocks new quotes.
- Configure structured log collection/retention and alerts before enabling: job failures, lease collisions, lag/age, finality mismatch, accounting mismatch, fee-estimation failure, transaction revert rate, resolution/challenge deadlines and provider freshness. Assign an on-call operator and resolver/watcher/arbiter coverage.
- Only after independent approval enable a small capped canary, with explicit legal/eligibility policy and separately approved private QA balances. A zero-balance-only site is not a functioning public trading launch. Verify real Mainnet wallet receipts/DB reconciliation **under new permission** before any public announcement.
- TAC Points formula, real token promises, public $500 campaign and sponsorship remain out of scope.

## 7. Monitoring, emergency, incident response

`operations.mts health` reports public aggregate conservation, chain/checkpoint/finalized heights, lag/age, and pause state with no user history or secrets. Exit 0 = healthy, 2 = alarm, 1 = configuration/provider/DB/error. Log success/failure metrics have fixed error codes; detailed investigation stays in restricted operator tooling without credential-bearing URLs.

For a new-engine incident: record UTC time, code/version, public block/transaction hashes, affected market IDs and alerts; stop new order flow, preserve logs/journal and page assigned responders. Never repair balances with SQL or grant arbitrary credits. A trading flag blocks the interface only; **on-chain pause by the authorized new guardian is required to block direct calls**, and is a separately approved transaction. User settlement remains available while trading is paused. Do not pause old contracts.

Reorg: provisional events become noncanonical and observations reorged; reconcile to common ancestor. A finalized-boundary mismatch halts rather than rewriting accepted history. Do not delete orphan evidence or advance cursors manually. Compare two independent RPC providers and escalate. Missing source result: respect challenge/deadline/void; never shorten published windows. Alert before deadlines, not only after an outage.

Gas/RPC incident: show unavailable/pending/reverted honestly, never credit by hash/signature. Verify the replacement receipt and expected event. Stop retry storms and restore provider/indexer before unblocking quotes. User-paid gas can be lost on a revert; no refund promise.

## 8. Costs and rollback

Actual local examples: Buy 115,508 gas units; partial Sell 136,474. These are not Mainnet fees. Base fees include L2 execution and L1 data/security cost; wallet full estimates control each transaction. Deployment, role grants, pool creation and settlement also consume native ETH. No fixed dollar estimate is reliable before current gas, ETH price, calldata and approved artifact are known. Compute `gasUnits * effectiveGasPrice + actual L1 fee`; preserve receipt data for actual cost. Provider, Worker/DB and log costs depend on traffic/plan; establish budgets and alerts before launch.

References: https://docs.base.org/specifications/transactions/network-fees and https://docs.base.org/get-started/connect-to-base (read during this review).

Before production: close Draft PR or revert its review commits; no production state needs undoing. After a separately authorized immutable deployment, Git rollback cannot reverse chain history. Keep virtual mode fail-closed rather than unsetting config and accidentally presenting the legacy real-USDC path. Preserve the old Worker version ID/bundle/config, audit/journal and settlement interfaces. Rollback application code only with compatible schema/config and an explicitly approved new-engine pause; never destroy new SQL tables or user settlement history. Recovery/re-enable requires a reviewed incident report and reconciliation, not automatic retry.
