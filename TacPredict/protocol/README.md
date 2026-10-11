# TacPredict native USDC protocol — implementation / launch runbook

**Status:** Six contracts deployed on Base Mainnet through a user-approved Base Account batch. NOT independently audited and NOT activated for real-money trading. The app fails closed without verified deployment configuration. Never use TestUSDC outside isolated tests. Home/Search/Markets/Rewards/Portfolio navigation remains unchanged. Welcome rewards are separate locked promotional credit, never contract collateral.

## Architecture

| Contract             | Responsibility                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| MarketFactory        | Authorized creation, question IDs, immutable metadata/rule/source hashes; reusable infrastructure, no per-market manual deployment               |
| MarketRegistry       | Unique markets, state/timing, pause new risk, immutable oracle/terms, final payout weights, permissionless timeout void                          |
| ConditionalPositions | Six-decimal ERC1155 outcome shares, complete-set split/merge, exact USDC collateral vault, burn-before-pay redemption                            |
| Exchange             | EIP-712 signed BUY/SELL limit orders; partial fills, nonce/cancel, ERC1271 validation, atomic on-chain settlement                                |
| ResolutionOracle     | Bonded trusted proposer, public counter-bond dispute, role-protected arbitrator, permissionless unchallenged finalization, timeout bond recovery |
| Settlement           | Claims and timeout void redemption; pays share owner, never caller-controlled recipient                                                          |

Existing official Base native USDC is used; no new production stablecoin contract. No TAC, swap, staking or games are added to prediction execution. Mainnet collateral: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.

### IDs and units

- Database: UUID; chain: `uint256 marketId`; original display: `TACP-000001`; unambiguous API/route ID: `TACP-8453-000001` (includes chain).
- Question/condition: `bytes32`, locked oracle + question + outcome count derivation. This implementation is **not** a claim of Gnosis CTF binary compatibility.
- All USDC and shares: six decimal atomic integer strings across HTTP/database; all transaction math uses BigInt, never JS floating point. Prices are atomic USDC/share, strictly between 0 and 1 USDC.
- Winning share pays 1 USDC. Uniform void payout is 1/outcome-count per current share. Complete-set holders recover principal. Secondary-market holders are **not** guaranteed their original purchase price on void.
- Redemption aggregates fractional remainders across an owner's outcomes before flooring. Cross-holder sub-atomic dust can remain locked; there is deliberately no admin sweep.
- Display probabilities are actual last filled share prices, NOT executable quotes or externally imported probabilities. No trades means unknown, shown as `—`.

## Commands (from app root)

```
npm ci
npm ci --prefix protocol
npm --prefix protocol run compile
npm --prefix protocol test
node protocol/scripts/deploy-testnet.mjs                 # dry run; no transactions
# Only after explicit operator approval with TESTNET credentials:
node protocol/scripts/deploy-testnet.mjs --execute-testnet
node protocol/scripts/indexer.mjs                       # requires verified deployment + server key + RPC
node protocol/scripts/matcher.mjs                       # dry-run matching
node protocol/scripts/matcher.mjs --execute              # explicit relayer execution
```

Test compiler: pinned solc 0.8.30, optimizer 200, viaIR, Shanghai; OpenZeppelin 5.2.0. Ganache is test-only. Sixteen local scenarios cover collateral conservation, pause/merge, signatures/partial fills/cancel/nonces, wrong chain/self-trades, insufficient allowances/atomic rollback, close/evidence source/time, dispute authorization, double claims, timeout bonds, signed matching, secondary void payouts and one-atomic-unit full-set recovery. The UI atomic quote tests also cover amounts larger than JS safe integers, six-decimal enforcement, price bounds and budget ceilings. This is NOT exhaustive fuzzing, an independent audit, or a production security guarantee.

## Database/main project

Main Supabase project: `lmqaiqvwcytmgwgwyfwx`. Migrations 0004–0015 are additive native `protocol_*` schema/read APIs; old accounts/data remain intact. Every native table has RLS. Anonymous/authenticated clients cannot write financial read models; only a privileged finalized-event indexer can. Own positions/claims/refunds are scoped to proven wallets. API numeric values are strings to preserve uint256 precision.

Tables include deployments, immutable metadata, markets/outcomes/sources/rules, wallets/ownership challenges, positions, signed orders, trades, transactions/event ledger, prices, proposals/evidence/disputes, claims/refunds, notifications/audit log/checkpoints. Order signatures are intentionally public for independent taker verification; account UUIDs and login tokens are not public orderbook fields.

`/admin` is protected by the server-owned `user_roles.admin` role, not user-editable metadata. It prepares canonical metadata and keccak hashes in Supabase. Metadata is served at `/api/protocol/metadata/<hash>`. The operator console prepares Factory/oracle/guardian transactions, checks deployed runtime hashes and role authorization, then requests a real wallet approval. Public market details include challenge/finalization/timeout actions. No transaction can proceed without a reviewed verified deployment. No user has been self-promoted to admin.

## Required launch configuration (not created by this change)

- Base Mainnet (8453) is the public production network. Actual Base Sepolia deployment is optional; isolated/fork testing and independent review still precede any explicitly approved mainnet deployment. Do not mark `verified=true` merely because transactions mined.
- Admin Safe/multisig, creator, guardian, proposer and arbitrator owners; grant Registry FACTORY_ROLE to Factory and ORACLE_ROLE to Oracle; no private keys in source/client/chat.
- Reviewed `protocol_deployments` row with actual runtime code hashes, official USDC and deployment block. Default `verified=false`, `trading_enabled=false`.
- Server-only `SUPABASE_SERVICE_ROLE_KEY` and Base Mainnet `BASE_PROTOCOL_RPC_URL` are installed in Cloudflare secret bindings. The bootstrap public RPC has rate limits and no SLA; choose a managed production endpoint before launch. Indexer/relayer GitHub credentials are not configured. Optional `BASE_SEPOLIA_PROTOCOL_RPC_URL`; indexer `PROTOCOL_RPC_URL`, `PROTOCOL_CHAIN_ID`; relayer key only if automated matching is explicitly enabled. No service key is bundled in the frontend.
- A scheduled GitHub workflow and database-backed per-chain leases/run logs/checkpoint fencing are implemented. Scheduler remains inactive without credentials and a verified deployment. Retries/monitoring/alerts/backups and production finalized RPC support still need operator configuration. Run sequentially. Checkpoint/hash mismatch halts; no silent reorg rollback.
- Relayer funding/rate limits/private-key custody, executable liquidity makers/complete sets. Matching is price-time deterministic, re-simulates approvals/signatures/state, and never credits a trade before the indexer sees finalized receipts. Outstanding orders do not reserve wallet balances; approvals/liquidity may change.
- Predetermined per-market sources/rules/evidence format and oracle operators. CoinGecko is **chart reference only**, not an automatically authorized settlement oracle. Sports/news settlement jobs are not implemented.
- Real account-to-wallet proof (SIWE challenge binds account/domain/nonce, expires in 5 minutes, consumes once). Social/email sessions alone do not establish wallet ownership. The wallet link backend requires the server key and Base RPC.
- Testnet end-to-end funded trade + disputes + claim/refund, independent security review/fuzzing, source verification and legal/compliance/geographic eligibility review before real-money launch.
- SMTP/MAU capacity appropriate to actual user traffic; no paid plan was upgraded.

## Current application behavior and remaining work

- Own Supabase feed replaces external Polymarket odds. No published native markets exist yet; deployment registration is separate from financial launch, so market lists are honestly empty; BTC/ETH/SOL spot reference cards still work.
- Detail has immutable IDs/oracle/rules/timeouts, real-trade history/statistics/activity, signed orderbook, exact limit buy quote and gated approval/signature/fill flows.
- Portfolio uses authenticated native positions/value/claim estimates and an on-chain verified claim/refund transaction flow. Wallet balance remains a direct USDC wallet read, not an app-generated number. Finalized per-account buys/sells/claims/refunds have an authenticated activity timeline. Full position cost-basis/P&L is not implemented.
- Dedicated maker UI now supports complete-set split/merge, exact share sell orders, explicit operator-approval acknowledgment, revocation and maker-only cancellation. Admin creation/resolution and public dispute/finalization/timeout UI are wired. Deposit/withdraw remain explicit unavailable previews, not app-custody transfers.
- Indexed liquidity is null until an executable depth calculation is implemented. Do not confuse volume with liquidity or open interest.
- Notifications/audit/event persistence are schema foundations; notification delivery, robust order cancellation synchronization under missed RPC jobs, indexer SQL integration tests, backfills and operational monitoring still need production completion.
- Testnet deployment script produces a manifest and multisig bootstrap calldata but does not register/activate a deployment in the database. The Mainnet batch is mined, with trading paused. No relayer private key or real-money activation is configured.

### Portfolio / Rewards follow-up

The frontend separates native wallet USDC, indexed positions/claimable proceeds and locked promotional credit. Migration `202610080013_native_reward_journey.sql` adds private native reward verification and finalized account activity. See `docs/PORTFOLIO_REWARDS_RELEASE.md` for explicit qualification semantics and launch limitations. These UI improvements do not activate deposits or trading and do not mint withdrawable rewards.

### Wallet approval integration

Base MCP is connected and exposes user-approved `send_calls` with Base Account approval URLs. Its schema requires a target address for every call: it does not expose bare CREATE contract deployment. Do not fabricate a missing target or assume an agent wallet is the user wallet. A read-only nine-call Mainnet deployment batch has now been simulated through the exact-runtime-checked public deterministic CREATE2 proxy. The user confirmed their Base Account as admin. Gas funding, immutable parameter review and actual Base Account approval remain pending. See docs/BASE_MAINNET_APPROVAL.md. No Mainnet transaction has been submitted.

### Deployed Mainnet / scheduled indexing

Actual receipt: `0x2b707200f70fb3d9c7598605f3d7cf57a05bded84842742b362004e82b4a0966`, deployment block `52453630`. See `protocol/deployments/base-mainnet.json`. The standard verifier supports exact EntryPoint UserOperation success, the nine-call smart-account batch, CREATE2 init-code/address proofs, runtime matching, role/pointer checks and finalized canonical receipts. A successful outer bundle alone is insufficient.

Cloudflare scheduled indexing is configured every five minutes, uses the existing server-only key and Base RPC, and is bounded to two 200-block chunks per invocation. DB leases/checkpoint fencing remain mandatory; no indexer call signs or submits blockchain transactions. The initial database registration is unverified and trading-disabled until finalized source/role verification succeeds. `scripts/package-cloudflare.cjs` preserves the scheduled handler in future releases; compile protocol artifacts before packaging. GitHub operations credentials and automated Mainnet matching remain separately unconfigured.
