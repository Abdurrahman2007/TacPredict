# Base Sepolia E2E status (honest)

**PR:** https://github.com/Abdurrahman2007/TacPredict/pull/27  
**Chain:** 84532 only. Mainnet deploy/submit: **not performed**.

## Current blocker (cannot claim broadcast E2E)

From `protocol/virtual/launch/approved-sepolia/estimate.json` and `sepolia-status.json`:

- Admin `0x57828f1aa32fD6be3988F240068Df53ed94b7AeF` observed balance: **0 wei**
- `deploymentStatus`: `NOT_DEPLOYED_ZERO_TEST_ETH` / `NOT_DEPLOYED_PERMISSION_BLOCKED`
- Cap: 0.01 Sepolia ETH; broadcast requires your wallet signature + faucet ETH
- This agent **does not** request private keys or broadcast without funded authorized wallet

Until you: (1) faucet-fund the admin on Base Sepolia, (2) authorize deploy/sign, (3) set `VIRTUAL_TRADING_CONFIG` to the live engine — **on-chain Sepolia Buy/Sell/keeper settlement is not executable here**.

## What was validated instead (local Cancun / Hardhat 31337)

`price-contract.test.mjs` and related suite cover:

| Requirement | Local evidence |
|-------------|----------------|
| Market create + price policy | ✔ VirtualPriceAMM createPool / configurePricePolicy |
| Fresh quotes; no tx on feed update | ✔ probability moves with mock feed; no TacPredict repricing writes |
| Separate Buy / Sell txs | ✔ distinct receipts |
| Balance / PnL / conservation | ✔ basis, realized PnL, reserves |
| Expiry cutoff / late trade | ✔ Closed() after close; late boundary rejected |
| Oracle capture / stale / sequencer | ✔ fail closed |
| Settlement + duplicate prevention | ✔ challenge → finalize; duplicate settle blocked |
| timeout-void | ✔ permissionless after deadline |
| Keeper idempotency / Mainnet block | ✔ `oracle-keeper.test.mjs` |
| XRP trading | ✔ blocked (`unavailable`) |
| Six Mainnet contracts unchanged | ✔ git diff pin in `safety.test.mjs` |

## Tradable vs unavailable

| Asset | Display | Paper trade | On-chain settle (feed-v1) |
|-------|---------|-------------|---------------------------|
| BTC/ETH/SOL/BNB short (5/15/30m) | Yes | Yes | **No** — Chainlink too slow |
| BTC/ETH/SOL/BNB long (e.g. 24h) | Yes | Yes | Policy allows when heartbeat safe |
| XRP | Charts only | **No** | **No** — no verified Base feed |

Fast oracle (Pyth/RedStone/Data Streams) for short windows: **evaluated in docs only — not deployed**.

## After you fund Sepolia (your steps)

1. Faucet → admin address (Base Sepolia).
2. Sign `unsigned-deployment.json` creation (compatible wallet).
3. Record engine address + `VIRTUAL_TRADING_CONFIG`.
4. Grant CREATOR/PROPOSER roles; create one private pool; Merkle grant 100 vUSDC.
5. Separate Buy then Sell; captureStart → proposeFromFeed → finalize.
6. Run `keeper-loop.mts` dry-run then Sepolia submit on secured host only.
7. Paste receipts into PR — then E2E can be marked pass.
