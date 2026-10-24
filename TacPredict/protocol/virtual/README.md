# Virtual USDC — review implementation

**Not deployed, not live, not independently audited.** Existing six contracts and their deployment manifest are unchanged. No production schema/configuration/secrets changed. The prediction screen layout and CSS are retained; virtual mode changes data/transaction adapters, labels and activity rows only.

## What works locally

- Separate non-upgradeable `VirtualAMM`: internal 6-decimal cash/shares, finite virtual seed budget, 2/3-outcome fixed-product pools, Buy/Sell, partial average-cost exits, settlement and voids. No token approvals, asset transfers, deposits, withdrawals, redemption or arbitrary balance setter.
- Each Buy/Sell is a direct wallet transaction. A transaction-wide EIP-1153 latch rejects a second trade through the same engine in the same transaction, including smart-account batches. Action nonces, deadlines, revisions and positive minimum output protect execution. Only one canonical engine may be enabled; deploying multiple engines would not provide a global cross-engine latch.
- Receipt + exact event verification, canonical event journal, fenced atomic checkpoints, finalized-boundary reorg handling, own-wallet RLS and chain/projection reconciliation. Missing/unreconciled state fails closed; virtual mode never falls back to the real Exchange.
- Existing wallet ownership/auth flow, shared trading-card adapter, virtual portfolio bindings, MFA-admin operations view and bounded manual indexing. No automatic indexer cron is activated.
- Versioned points candidate calculator and additive SQL drafts. No approved weights/reward budget, points distribution, TAC token or sponsorship.
- Future Merkle grants are configurable, not automatic. **No $500 campaign** or registration grant exists. A wallet can claim once per explicitly configured campaign; cross-campaign eligibility is a future policy decision.

## Accounting and limits

For reserves `r[i]`, maintain `K = product(r[i])`. The normalized marginal price is `(1/r[i]) / sum(1/r[j])`. Quotes expose rounded execution price separately from this marginal mark.

Buy gross cash `a`: retire `ceil(a * feeBps / 10000)` fee, add net cash as complete sets, then release selected shares while rounding the remaining selected reserve upward so K cannot decrease. Sell owned shares: binary-search the largest complete-set cash removal that preserves K, the reserve floor and collateral; retire the rounded fee. Insufficient reserves, zero-rounded output, stale revision, ownership/balance limits, pool caps or `minOut` failure revert atomically. Virtual liquidity is finite, not a guarantee of execution.

Pool seed, fee, reserve floor, input/share/position caps, timing and metadata/rules hash are immutable per pool. Technical fee ceiling is 1,000 bps, **not a selected launch fee**. Seed/grant aggregate caps are immutable constructor parameters; seed is not withdrawable or topped up. All production values need approval.

Buy adds gross cash to position basis. Partial Sell removes proportional basis rounded down; final exit removes the remainder. Realized PnL is net proceeds minus removed basis. Unrealized PnL is marginal marked position value minus remaining basis, **not a guaranteed executable liquidation quote**. Final winner pays one virtual unit/share; void pays uniform `1/outcomes`, with wallet-aggregate rounding and consistent per-outcome PnL allocation. Pool inventory payout/fees are retired to non-spendable accounting sinks; rounding dust remains locked. Conservation invariant: `totalCash + lockedCollateral + feeSink + protocolSink = granted + seeded`.

Proposer submits evidence after `resolveAfter`; watchers challenge during the frozen challenge window. Uncontested finalization is permissionless after that window; contested outcomes require an arbiter, after the window and before the deadline. Unresolved/contested timeout can become void only under the precommitted deadline rule. A five-minute trading window does not imply five-minute settlement. This is role-based adjudication, **not a trustless oracle**.

## Run checks

From `TacPredict/`, Node 24:

```sh
npm ci
npm ci --prefix protocol/virtual
npm --prefix protocol/virtual run compile
npm --prefix protocol/virtual test
npm run typecheck
npm run lint
npm run build
```

Build requires existing app Supabase environment names; use disposable local values, never production credentials for tests. Root prebuild regenerates existing brand assets; exclude unrelated generated changes. Existing regression tests use the repository's separate protocol/test runner; see `VALIDATION.json` for the actual completed run. Virtual tests launch a local Cancun Hardhat chain and apply the SQL draft only to disposable PGlite PostgreSQL. They include actual contract receipt → TypeScript indexer → PostgreSQL → reconciled cash/position/PnL validation.

## Base Sepolia instructions — separate approval required

No remote testnet deployment or testnet transaction has been performed in this task.

1. Review/audit the source, permissions and finite seed/grant caps. Choose **test-only** constructor values in 6-decimal atomic units. Zero immutable budget permanently disables that budget. Obtain test ETH yourself; never provide a private key/seed phrase in chat.
2. Prepare an unsigned payload (does not connect, sign or broadcast):

   ```sh
   cd protocol/virtual
   node scripts/prepare-testnet.mjs ADMIN_ADDRESS SEED_BUDGET_ATOMS GRANT_BUDGET_ATOMS
   ```

   Review `unsigned-sepolia-deployment.json` with chain ID **84532**. An authorized wallet may deploy it on Sepolia only after approval. No mainnet deployment script is included. Verify constructor arguments, deployed runtime bytecode and source before use; the compiler is pinned to solc 0.8.38, optimizer 200, viaIR, Cancun.
3. On the **new test contract only**, explicitly grant least-privilege creator, guardian, proposer, watcher and arbiter roles. Constructor grants only default admin; no markets/campaigns are active. Use distinct test operators to exercise disputes. Admin login does not grant contract permissions.
4. Prepare metadata JSON using the exact strict schema in `src/lib/virtual/runtime.server.ts`: `id,title,category,description,outcomes,source,sourceUrl,rules`. Category is `Crypto` or `Sports`; source URL is HTTPS; outcomes count is 2 or 3. The ID must be the engine's next pool ID. Prepare terms JSON with `openAt,closeAt,resolveAfter,resolutionDeadline,challengePeriod,seed,reserveFloor,maxCashIn,maxSharesIn,maxPosition,feeBps,outcomes` (timestamps UTC seconds, quantities atomic units). Then:

   ```sh
   node scripts/prepare-pool.mjs metadata.json terms.json
   ```

   This produces unsigned `createPool` calldata and the canonical metadata hash. Review immutable rules, sources, price/capacity parameters and time ordering before an authorized Sepolia signature. APIs/AI do not finalize outcomes.
5. In a **disposable local/test Supabase project only**, review/apply existing prerequisites plus `supabase/migration-drafts/virtual-v1.sql`. It is intentionally outside automatic migrations. Register the test deployment with ID `chainId:lowercaseEngine:lowercaseRuntimeCodeHash`, `start_block=deploymentBlock`, `checkpoint=finalized_block=start_block-1`; hashes are initially null. No production migration is authorized.
6. In a **local/test environment only**, configure server-only `VIRTUAL_RPC_URL` and `VIRTUAL_TRADING_CONFIG` with `{chainId:84532,engine,codeHash,startBlock:"...",enabled:false,markets:[metadata]}`. Use the actual deployed runtime hash, not placeholder addresses or old contract addresses. Indexing/read-only mode works while execution is disabled. Enable execution only after separate test approval and successful reconciliation.
7. Use the existing verified wallet login and MFA-admin **Virtual trading** view to index bounded batches. Alternatively an authorized internal operator can invoke exported `runVirtualIndexer`; no public unauthenticated job endpoint or scheduler was enabled. Plan a protected scheduled runner separately before launch.
8. With a separately approved **test-only campaign**, construct double-hashed Merkle leaves `keccak256(keccak256(abi.encode(engine,chainId,campaignId,wallet,amount)))`, set finite root/budget/expiry, and claim with proofs. There is no automatic grant UI/campaign. Test Buy and Sell as separate wallet transactions, partial exits, stale quotes, insufficient liquidity, settlement, challenged resolution, void and reorg recovery. Reconcile receipts, event journal and chain state.

Initial gas route is user-paid native ETH, wallet estimated. No real USDC is used. Local gas measurements are not mainnet fee quotes. The direct transaction adapter is compatible with a future constrained relayer, but no paymaster/sponsorship is implemented.

## Points and security boundaries

`points.ts` produces review candidates from complete, canonical, finalized wallet histories: buy-only volume (avoid double-counting exits), net realized PnL and distinct UTC active days. Completed market episodes are attributed to their closing month; open episodes defer. Rapid-offset episodes are flagged/held back while their losses still count. Integer normalization/caps/weights/minimum holding period are explicit versioned inputs, **not approved business rules**. Approved formula/snapshot/candidate history is immutable in the SQL draft. No automatic monthly publishing/distribution exists.

Rapid-offset detection is not complete wash/Sybil prevention: coordinated wallets, eligibility, per-market concentration, external-price abuse and campaign fraud require additional approved rules/monitoring. Public chain records expose wallet activity. Role compromise, malicious resolution, stale RPCs, finite virtual liquidity, quote contention and adversarial ordering remain material risks. Tight quote revisions fail closed rather than silently moving the price. A finalized-history mismatch halts indexing for operator investigation, not silent rewriting.

## Remaining launch blockers / scope

- Independent Solidity/economic review and longer invariant/fuzz/adversarial testing; local tests are not an audit or production proof.
- Approved constructor liquidity/grant caps, campaign eligibility/amounts (none currently launched), per-market fees/limits, trusted metadata/data sources and resolution operators.
- Separately approved deployment, bytecode verification, migration/configuration, protected continuous indexer scheduling and live operational monitoring. No existing contract must be activated to use this separate path.
- Production RPC/provider resilience and supported-wallet/mobile browser E2E checks. Local contract/backend E2E is tested; deployed Cloudflare/Supabase/wallet integration is **unverified**.
- A claim/onboarding campaign screen, richer historical performance chart, comprehensive points admin approvals/distribution and sponsorship are **not implemented**. Existing prediction/portfolio layout is retained; no fake performance series or liquidity is fabricated.

Exact changed files: `CHANGED_FILES.txt`. Evidence/classification and actual check results: `VALIDATION.json`.

## Rollback

Before deployment: close the Draft PR or revert its single implementation commit; no production state needs reversal. Configuration is absent by default, so the existing path remains unchanged. A future enabled virtual deployment must never silently route a virtual trade to the old Exchange. After any separately approved immutable deployment, Git rollback cannot undo chain history: preserve indexed evidence and settlement access, disable new execution only through authorized controls, and review a dedicated operational rollback. Never change/pause the six existing contracts as part of this rollback.
