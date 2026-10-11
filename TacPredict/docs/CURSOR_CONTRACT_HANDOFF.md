# TacPredict — Cursor contract/backend handoff

## 0. Critical instruction: use the correct code, do not redeploy

The user's screenshot shows another checkout reporting that contracts are missing. This does NOT establish that contracts were never built/deployed. The current implementation is in GitHub repository **Abdurrahman2007/TacPredict**, branch **development/base-usdc**. The latest implementation commit before this handoff is **7e33a801791ff844fde6563ac0d036231320785f**; validation documentation commit **034a5b39ddf628ebc7ecad211b363336455f6090**. Fetch the latest branch. Remote repository paths have the `TacPredict/` prefix. App root is the directory containing `package.json`, `src/`, `protocol/`, `supabase/`.

Do not assume another `/root/promptql` or default-branch checkout contains this implementation. Inspect `git status`, back up existing changes and compare branches. Never reset or overwrite unrelated work. A safe separate clone for inspection is:

```bash
git clone --branch development/base-usdc https://github.com/Abdurrahman2007/TacPredict.git tacpredict-current
cd tacpredict-current/TacPredict
ls protocol/contracts protocol/deployments src/lib/protocol
```

Do NOT redeploy the six contracts, create another USDC token or another Supabase project simply because a stale checkout cannot find them. Deployed contracts exist on Base Mainnet. Contracts themselves are not inside Supabase; Supabase holds indexed read models, metadata, account/wallet links and audit state. Frontend/backend integration is necessary and already partly wired below.

## 1. Actual network / deployment

- Production network: **Base Mainnet, chain ID 8453 / 0x2105** only.
- Native USDC: **6 decimals**; existing Circle contract, NOT redeployed.
- Deployment method: user-approved Base Account batch through the public deterministic CREATE2 deployment mechanism; six deployments + two Registry role grants + pause = nine atomic calls.
- Production contracts are directly addressed, not upgradeable proxies. The CREATE2 deployment proxy was a deployment mechanism, not the application's implementation proxy.
- Compiler: **solc 0.8.30+commit.73712a01**, optimizer 200, viaIR=true, EVM Shanghai; OpenZeppelin 5.2.0.
- Manifest verification checked creation input/constructor arguments, exact smart-account/UserOperation success, runtime hashes, pointers, roles and finalized canonical receipt. Outer bundle success alone is insufficient.

Admin Base Account: `0x57828f1aa32fd6be3988f240068df53ed94b7aef`

Deployment TX: `0x2b707200f70fb3d9c7598605f3d7cf57a05bded84842742b362004e82b4a0966`

Deployment block: `52453630`

| Component | Exact Base Mainnet address |
|---|---|
| MarketRegistry | `0x8aCC19eb2F3DCCEdA99Af89cC30416D17f02cd0A` |
| MarketFactory | `0xe01c23aac6f152a2eA437A7E6Eb0a664A1908568` |
| ConditionalPositions | `0x00adb2c69B58f66aB64DDb0Da01B7C72A3E8F2A7` |
| Exchange | `0x7e5e40bAE779ebabB2295Ef6d009ab95b0307F85` |
| ResolutionOracle | `0xF50797C34B214C81B80A9bd3e590C3cA0DF8118f` |
| Settlement | `0x9b272C68F3338655a440B44DBc9CCB993D7650B3` |
| Existing native USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

Authoritative files:
- `protocol/deployments/base-mainnet.json` — addresses, receipt, deployment block, constructor arguments, salts/init-code hashes and six expected runtime hashes.
- `protocol/deployments/base-mainnet.json.verification.json` — finalized runtime/role/deployment verification.
- `protocol/deployments/base-mainnet.sources.json` — ALL SIX BaseScan public source proofs and Sourcify creation/runtime exact matches.

Source verification is complete. **Independent security audit is NOT complete. Source matching is not an audit.** Last verified operational state: trading paused; DB `verified=true`, `trading_enabled=false`; no native market created by this session. Last read `nextMarketId=1`. Re-read current chain state before taking action; do not treat historical balances/checkpoints as current.

## 2. Contract architecture — actually implemented

### MarketRegistry
`protocol/contracts/MarketRegistry.sol`
- Locks native USDC address/6 decimals, market identity, oracle, metadata/rules/source hashes, outcome count and market times.
- Roles: DEFAULT_ADMIN_ROLE, FACTORY_ROLE, ORACLE_ROLE, GUARDIAN_ROLE.
- Actual enum indexes: DRAFT=0, UPCOMING=1, OPEN=2, CLOSED=3, RESOLVING=4, RESOLVED=5, SETTLED=6, VOID=7, CANCELLED=8.
- Enum names do NOT mean each state has a implemented transition. Current terminal payout paths are RESOLVED and VOID. There is no arbitrary cancel/settled override API.
- `getMarket()` derives upcoming/open/closed from block time for nonterminal trading states; no separate open transaction is necessary.
- `isTradingOpen()` also respects global trading pause.
- `checkpointClose()` records close after deadline; it is not a freely editable close time.
- Registry accepts create/finalize only through the authorized Factory/Oracle relationships.
- Permissionless `timeoutVoid()` only after immutable resolution deadline. No early refund or admin collateral sweep.

### MarketFactory
`protocol/contracts/MarketFactory.sol`
- MARKET_CREATOR_ROLE creates markets using reusable shared contracts; **no new contract per market**.
- `createMarket(Terms,string metadataURI)` emits registry creation + MetadataPublished.
- Terms tuple, exact order:
`bytes32 salt, bytes32 metadataHash, bytes32 rulesHash, bytes32 sourceHash, uint8 outcomes, uint64 openAt, uint64 closeAt, uint64 resolveAfter, uint64 resolutionDeadline`.
- Outcomes: **2 to 8**. Times are Unix UTC seconds; supplied salt must be unique/nonzero.
- Actual question ID:
`keccak256(abi.encode(block.chainid, address(factory), salt, metadataHash, rulesHash, sourceHash, closeAt))`.
- Actual condition ID:
`keccak256(abi.encode(oracle, questionId, uint256(outcomeCount)))`.
- Do not replace `abi.encode` with packed encoding. This is NOT a Gnosis CTF-compatibility claim.

### ConditionalPositions
`protocol/contracts/ConditionalPositions.sol`
- ERC1155 outcome shares + exact native-USDC collateral vault. Shares use six-decimal atomic units in this protocol.
- `split(marketId, amountAtomic)` transfers USDC into Positions and mints an equal quantity of EVERY outcome. **It does not mean buying only YES.**
- Before split: approve **USDC -> Positions** for the reviewed amount; open market + unpaused trading required.
- `merge()` burns an equal full set and returns collateral before final payout. Pause does not block this escape path.
- `tokenId(marketId,outcome)` = uint256(keccak256(abi.encode(conditionId,uint256(outcome)))). Never invent token IDs.
- `redeem()/redeemFor()/claimable()` use Registry payouts; burns holdings before USDC transfer. Helper-triggered redemption pays the share owner, never an arbitrary recipient.
- Winning share pays 1 USDC; losing share 0.
- VOID: equal payout weights, denominator outcome count. Full-set holders recover principal. **A secondary buyer is NOT guaranteed their historical purchase price on void.**
- Fractional carry is aggregated across the same holder's outcomes. Cross-holder sub-atomic dust may remain locked. No admin sweep exists.

### Exchange
`protocol/contracts/Exchange.sol`
- CLOB / off-chain signed order discovery with **atomic on-chain USDC/share settlement**, not an AMM.
- EIP-712 domain: name `TacPredictExchange`, version `1`, chainId=8453, verifyingContract=deployed Exchange.
- Exact Order tuple:
`uint256 marketId, uint8 outcome, address maker, bool isBuy, uint256 price, uint256 shares, uint256 nonce, uint64 expiration, address taker`.
- Price scale = 1_000_000, price strictly >0 and <1_000_000; share quantities are atomic integers. `taker=zeroAddress` means open counterparties.
- `orderId`, `fillOrder`, `matchOrders`, `cancelOrder`, `invalidateNonce`; partial fill tracking and ERC1271 signature support.
- Self trades, expired/wrong-chain orders, overfills and invalid signatures are rejected.
- Buyer approves **USDC -> Exchange**. Seller approves **Positions.setApprovalForAll(Exchange,true)** with explicit user acknowledgment/revocation support.
- Direct fill settles at the order's signed price; crossed matching settles at seller price while respecting exact cumulative buyer limits.
- A posted order does NOT reserve balances; approvals, collateral and nonce validity may change. Re-simulate before execution.
- Existing Exchange does **not** implement configurable platform/creator fees or treasury sweeps. Do not fake fee settings in UI or assume a fee contract exists.

### ResolutionOracle
`protocol/contracts/ResolutionOracle.sol`
- Bonded **trusted resolver beta**, not UMA, not Chainlink integration, not decentralized autonomous resolution.
- Roles: DEFAULT_ADMIN_ROLE, PROPOSER_ROLE, ARBITER_ROLE. Confirmed admin was constructor-granted these bootstrap roles.
- Immutable `bond=5_000_000` = **5 native USDC**; `challengePeriod=86400` = **24 hours**. No setters exist.
- Approve **USDC -> Oracle** before a bonded proposal/dispute.
- `propose(marketId,outcome,voided,evidenceHash,sourceHash,sourceTimestamp)` pins the source hash and requires valid close/resolve/deadline timing. It commits an evidence hash; that alone does not cryptographically prove a web API's truth.
- Proposal -> challenge window -> unchallenged permissionless `finalize()`. A dispute blocks public finalization.
- Counter-bond public `dispute()`; role-protected `resolveDispute()` after challenge window.
- `credits()/withdrawBondCredit()` pull-payment bond recovery; timeout `releaseTimeoutBonds()` after actual VOID.
- Leave a COMPLETE 24h challenge window before resolution timeout. Never shorten/bypass it in UI or DB.

### Settlement
`protocol/contracts/Settlement.sol`
- `claim(marketId)`, `claimable(marketId,address)`, `refund(marketId)` delegate to actual share redemption.
- Refund requires existing VOID or a permitted after-deadline timeout; not arbitrary admin refunds.
- Pays the holder. It is NOT an app-custody deposit/withdraw bank or a treasury contract.
- Claim/merge/timeout recovery are separate from new-risk trading pause.

## 3. Important missing pieces — do not claim completed

- No native market / published Market #1 created by this session.
- No seeded funded makers/complete sets/live executable CLOB depth.
- No real funded Base Mainnet buy/sell -> oracle proposal -> full challenge -> resolve -> claim/refund E2E.
- Automated Mainnet matcher signing/submission and funded relayer custody are NOT enabled.
- Automatic oracle signing/submission and sports/news evidence pipelines are NOT enabled.
- Independent audit/fuzzing/operational monitoring/alerts/production SLA/legal launch review are NOT complete.
- Cost basis/full P&L, executable-liquidity calculation, fee/treasury workflows and full role-specific admin workflows remain incomplete.
- Native market data can honestly be empty. Do NOT insert fake markets/trades/prices/USDC credits to make the UI look populated.

An illustrative complete-set test uses 1 USDC collateral plus the immutable 5 USDC oracle bond, with gas additional. This is not a guaranteed full Exchange-E2E budget: directional trading requires distinct genuine maker/taker wallets and funded signed orders. Do not equate complete-set minting with proving the buy/sell path. Last session reads had no native USDC in the confirmed admin wallet; check current balances before quoting funding. Never redeem unrelated LP assets, swap funds or unpause globally without explicit approval.

## 4. Supabase — keep the existing MAIN project

Project ID: `lmqaiqvwcytmgwgwyfwx`
Public project URL: `https://lmqaiqvwcytmgwgwyfwx.supabase.co`
Do not create or switch to a new database.

Additive native migrations **202610080004 ... 202610080016** are applied in this project. Inspect real schema and migration history before running anything; do not blindly rerun non-idempotent CREATE FUNCTION / CREATE POLICY migrations. Previous account/reward data remains intact.

Tables/read models:
- `protocol_deployments`, `protocol_market_metadata`
- `protocol_markets`, `protocol_market_outcomes`, `protocol_market_sources`, `protocol_market_rules`
- `protocol_wallets`, wallet ownership challenge/link tables
- `protocol_positions`, `protocol_orders`, `protocol_trades`
- `protocol_transactions`, `protocol_chain_events`, `protocol_market_prices`
- `protocol_resolutions`, `protocol_resolution_evidence`, `protocol_disputes`
- `protocol_claims`, `protocol_refunds`, `protocol_notifications`, `protocol_audit_logs`
- `protocol_indexer_checkpoints`, `protocol_job_leases`, `protocol_job_runs`

RLS protects native tables. Anonymous/authenticated users cannot fabricate financial read models. Finalized indexer owns financial writes. Private positions/claims/refunds belong to **proven** wallet ownership, not an arbitrary connected address. Email/Google/X/Farcaster login is not by itself proof of a wallet holding shares.

Identity layers: internal DB UUID; on-chain uint256 marketId; original display `TACP-000001`; chain-aware route/API ID **`TACP-8453-000001`**. Do not use the UUID/display string as the ABI uint256 or guess IDs for prepared metadata.

Financial truth is Base contracts. Supabase is an indexed projection plus immutable metadata/order discovery. USDC/shares/prices across DB/API are atomic decimal **strings**, with BigInt transaction math; no float-based amounts.

## 5. Existing application integration — reuse it

The app is **React19 + TypeScript + TanStack Start/Router/Query**, not Next.js. Do not paste a Next.js route example unchanged.

- `src/lib/onchain/base.ts`: Base config/native token.
- `src/lib/protocol/types.ts`: chain-aware native schema and deployment/runtime expectations.
- `src/lib/protocol/market-feed.functions.ts`: own Supabase native discovery feed, source TacPredict; not Polymarket odds.
- `src/lib/protocol/read.functions.ts`, `read.server.ts`: read RPCs/orderbook/activity.
- `src/lib/protocol/orders.ts`, `orders.functions.ts`, `orders.server.ts`: exact signed-order format, validation and submission/discovery.
- `src/lib/protocol/execution.ts`: actual wallet approvals, signed orders/fills, split/merge, claim/refund; rejects missing/wrong runtime/token/chain configuration.
- `src/lib/protocol/operator-actions.ts`: reviewed immutable market terms and Factory/oracle/guardian wallet transactions, simulations and receipts.
- `src/lib/protocol/wallet-link.functions.ts`, `wallet-link.server.ts`: real ownership proof, account/domain/nonce binding and expiry/one-time consumption.
- `src/lib/protocol/admin.functions.ts`: real assigned admin and verified-session checks; new protected reads/preparation/deployment access require AAL2.
- `src/routes/api/protocol/metadata/$hash.ts`: approved immutable metadata served at `/api/protocol/metadata/<hash>`.
- `src/routes/admin.tsx`, `src/components/native-operator-console.tsx`: metadata preparation + authorized wallet-signed on-chain operator actions.
- `src/components/admin-workspace.tsx`, `admin-mfa.tsx`, `src/lib/protocol/admin-view.ts`: new first-phase admin read workspace + Supabase TOTP/AAL2 integration, not a completed A-Z admin system.
- `supabase/migrations/202610080016_admin_read_workspace.sql`: role+AAL2 database guards; real snapshot views; no balance writes or role grants.
- `docs/ADMIN_IMPLEMENTATION_PLAN.md`: precise implemented-vs-pending admin scope and observed tests.

Keep public **Home/Search/Markets/Rewards/Portfolio** navigation. Spot BTC/ETH/SOL chart data is reference data, NOT a permissionless settlement oracle. No TAC Points/USDT/swaps/staking/games as prediction collateral. The 15-USDC promotional reward is separate locked account credit, never collateral or a withdrawable wallet balance.

## 6. Operational indexer and matcher

- Shared indexer: `protocol/scripts/indexer-core.mjs`.
- CLI adapter: `protocol/scripts/indexer.mjs`; bounded non-signing administrative backfill.
- `job-client.mjs`: exact main-project validation, DB job leases/renewal/fencing and safe error redaction.
- `request-budget.mjs`: track actual RPC + DB HTTP requests.
- Production Cloudflare Worker: **tacpredict-app**; real cron **`* * * * *`**.
- Dedicated Alchemy **Base** RPC is installed SERVER-ONLY as `BASE_PROTOCOL_RPC_URL`. No multiple-account quota evasion or paid upgrades were done.
- Alchemy Free `eth_getLogs`: **10-block ranges**.
- Free Worker: maximum **6 chunks/run**, **48 total tracked HTTP requests**, 45 work + 3 reserved for run completion/lease cleanup.
- Finalized canonical events only; (chainId,txHash,logIndex) idempotency; checkpoint CAS and lease fencing. Unknown/mismatched event/runtime/receipt/checkpoint halts; no skipping failed blocks or inventing a reorg rollback.
- Actual backlog caught up. Post-admin-deployment real runs SUCCESS at 08:22/08:23/08:24 UTC, last recorded checkpoint **52457637**. These are historical observations, not a live head or throughput guarantee.
- Diagnostic logging restored to 10% sampling with query-string redaction. Free tiers are not a production SLA; monitor actual usage/capacity.
- `scripts/package-cloudflare.cjs` bundles the scheduled handler + indexer ABIs with app releases. A generic deployment replacing only the web entry can break scheduling: preserve handler, bindings and existing cron.
- `protocol/scripts/matcher.mjs`: deterministic price-time matching, dry run by default, runtime/role/state/signature/allowance simulation. No active autonomous funded Mainnet signer. **Do not run --execute or set MAINNET_MATCHING_APPROVED=true without reviewed explicit approval.**
- `.github` scheduled workflows are foundations; their separate operation credentials are not configured merely because Cloudflare's cron works.

## 7. Oracle observation tooling — unsigned, not autonomous

`protocol/scripts/oracle-observer-core.mjs` and `prepare-oracle-evidence.mjs` support an explicitly agreed **coinbase-candle-close-v1** rule. Exact product BTC-USD/ETH-USD/SOL-USD, UTC minute and threshold must match approved immutable metadata/rules/source hashes. Missing/duplicate/inconsistent candles fail closed; BigInt decimal comparison is used.

```json
{"kind":"coinbase-candle-close-v1","product":"BTC-USD","candleStart":1700000040,"thresholdUsd":"83000"}
```
This is illustrative only. Do not create/resolve a real market from these example values. Use `rulesForSpec` and `sourceForSpec` before locking the actual terms; do not reinterpret arbitrary existing rules.

`node protocol/scripts/prepare-oracle-evidence.mjs <onchain-market-id> spec.json output.json`
prepares a real-source evidence document/hash and **unsigned proposal calldata** after runtime/metadata/timing checks. It does NOT approve collateral, sign, submit, create a market or credit a finalized resolution. CoinGecko's spot API is NOT the configured settlement oracle.

## 8. Local verification commands / secrets

From app root, Node24 used:

```bash
npm ci
npm ci --prefix protocol
npm run compile --prefix protocol
npm test --prefix protocol
npm run build
./node_modules/.bin/tsc --noEmit
```

Expected last observed full suite: **26 top-level tests passed**, including isolated contract scenarios. Isolated TestUSDC/Ganache is test-only; no live test stablecoin was deployed. This is not real funded Mainnet E2E or an independent audit.

ABI/artifacts are generated by compile: `protocol/artifacts/{MarketRegistry,MarketFactory,ConditionalPositions,Exchange,ResolutionOracle,Settlement}.json`. Missing ignored artifact files are NOT missing contract implementation. Frontend selected ABI definitions also exist in `orders.ts` and `operator-actions.ts`.

Read-only deployment verifier: `protocol/scripts/verify-deployment.mjs`. Inspect its required environment and manifest argument before running. It never automatically marks DB verified or activates trading.

Server-only environment (provision privately, never paste keys into model prompts/chat/repo):
- `SUPABASE_URL` = existing main project URL
- `SUPABASE_PUBLISHABLE_KEY` = project's browser-safe public key
- `SUPABASE_SERVICE_ROLE_KEY` = existing dedicated native-server secret, SERVER ONLY
- Cloudflare `BASE_PROTOCOL_RPC_URL` = private dedicated Alchemy Base endpoint
- CLI `PROTOCOL_RPC_URL` = same approved Base endpoint, `PROTOCOL_CHAIN_ID=8453`
- `COINGECKO_DEMO_API_KEY` = server-side chart reference key

Never put service/relayer/RPC secrets in `VITE_*`, frontend bundles, screenshots or git. No relayer private key is provided in this handoff. Do not confuse a user-owned Base MCP signing wallet with an agent wallet.

## 9. Cursor next-work sequence

1. Fetch/inspect the correct branch; compare local code, source verification and existing live manifest. Preserve user changes.
2. Compile ABIs and run tests/typecheck/build. READ current Base bytecode hashes, addresses, pointers, roles, paused flag, nextMarketId, bond/challenge and collateral before mutations.
3. Confirm the MAIN Supabase deployment row/read RPCs/migrations/checkpoint/job success. Do not duplicate migrations or financial tables.
4. Reuse the native feed/order execution/portfolio/claim integrations; remove remaining stale Polymarket primary-source usage only if actually found in the latest code. Empty native markets are legitimate, not a reason to fabricate demo trades.
5. Finish security-scoped admin role matrix, paginated investigation, session/MFA revocation tests, monitoring and explicitly unsupported workflows. Keep financial settings honest about immutable contract support.
6. Review immutable first-market question/outcomes/times/source/criteria/evidence/timeout and budget; verify genuine native USDC + gas and distinct maker/taker ownership. Obtain explicit wallet approval for each financial action.
7. Create a tightly scoped reviewed market and funded E2E. Never treat a full-set mint as a directional trade test. Respect the 24h challenge. Reconcile final receipts, canonical indexer rows, positions and claims/refunds. Do not mark operator tests as promotional task completion.
8. Complete independent audit/monitoring/funding/oracle/relayer/operational/legal gates before any separate reviewed launch/unpause. **Do not turn trading_enabled=true or call pauseTrading(false) to make UI buttons work.**

## 10. Stale documentation warning

`protocol/README.md` has chronological historical sections still mentioning old public dRPC, five-minute cron/four50-block chunks and pre-approval deployment status. Those statements are superseded by the latest manifests, `docs/BASE_MAINNET_APPROVAL.md`, its finalized indexer recovery entry and this handoff. Historical testnet scripts/utilities remain for isolated safety work; production remains Base Mainnet-only. Never follow an old testnet deploy command as the default next step or claim a testnet asset is real USDC.

## Cursor paste-in directive

> Read this handoff and the existing development/base-usdc branch first. Six Base Mainnet contracts are ALREADY deployed and publicly source-verified; do not redeploy. Use the existing main Supabase project and real native protocol integrations. Financial truth is finalized Base events, not editable admin balances. Keep public navigation unchanged. No invented market IDs, quotes, balances, fees, treasury functions or completed workflow claims. First inspect/test/read current state; produce a concrete done/partial/missing checklist. Finish integration/admin work safely, then request human funding/terms/wallet approval for genuine Mainnet E2E. Preserve pause and AAL2/role checks until an explicit reviewed launch. Use private environment secrets, not credentials in prompts.
