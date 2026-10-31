# Virtual USDC contract set (Base)

Status: **source + tests only. Nothing is deployed, no app or database setting changes.** Mainnet deployment needs separate approval from the project owner.

## Why a new set

The six production contracts (`MarketRegistry`, `ResolutionOracle`, `MarketFactory`, `ConditionalPositions`, `Exchange`, `Settlement`) take real native Base USDC and the registry refuses any other collateral. They stay exactly as they are. A virtual-money season therefore needs its own set of the same six, with a collateral token that has no value.

## What is in this change

| Contract | What it is |
| --- | --- |
| `VirtualUSDC` | Virtual collateral token, symbol `vUSDC`, 6 decimals. Written by hand. |
| `VirtualMarketRegistry`, `VirtualResolutionOracle`, `VirtualMarketFactory`, `VirtualConditionalPositions`, `VirtualExchange`, `VirtualSettlement` | Generated from the six production files by `scripts/generate-virtual-set.mjs`. Same logic. |

The generator only (1) renames, (2) swaps the registry's "native USDC only" pin for "collateral must say it is virtual", (3) gives the exchange its own EIP-712 domain name `TacPredictVirtualExchange`, so an order signed for one set can never be filled in the other. `test/virtual-set-source.test.mjs` fails if a generated file drifts or if any other line differs from the original.

Both the token and the registry revert on any chain except Base mainnet (8453) and Base Sepolia (84532).

## VirtualUSDC rules

Balance can only come from three onchain transactions, each signed and gas-paid by the wallet:

- `openBox()`: once per wallet per season, a random whole-dollar amount from 50 to 500 USDC (the new-account campaign box).
- `checkIn()`: once per UTC day, only after the box was opened. Streak rewards 20, 30, 40, 50, 60, 70, 80 USDC on days 1 to 7, then it starts again at 20. A missed day restarts the streak.
- `adminGrant(wallet, amount, reasonHash)`: the admin can fund a wallet, but only inside `adminSeasonBudget` (fixed at deployment, resets each season). Every grant is an `AdminGranted` event. The admin has no function to take, burn or edit a balance and cannot touch positions. Use a multisig (Safe) as admin.

Other rules:

- Not transferable by users: `transfer` / `transferFrom` revert unless the caller is on the protocol list. The list is meant to hold exactly `VirtualConditionalPositions`, `VirtualExchange` and `VirtualResolutionOracle`; the admin builds it during deployment and then calls `lockProtocol()`, after which it can never change. So the balance can be traded but not sent to anyone or withdrawn.
- Seasons: the admin can only call `startSeason()`, at least 20 days after the previous one. It does not touch balances; it lets wallets open a box once more and resets the admin budget. With `resetOnClaim = true` a new-season box first burns the wallet's unspent balance.
- Wallets show it as `vUSDC`, not `USDC`, so it cannot be mistaken for real USDC. The app can still say "USDC" in its own text, next to "cannot be withdrawn".
- Users pay gas in ETH on Base for every box, check-in, buy and sell. That gas is the only real money involved.
- **Box randomness is not tamper-proof.** It uses `block.prevrandao`, the previous block hash, the wallet and a counter. A smart-contract wallet can simulate the box and revert until it likes the amount (it pays gas for each try), and the sequencer can influence it. It is fine for a virtual campaign, but points and ranking should not depend on the size of the box (for example score PnL as a percentage and cap volume).
- Total supply is not capped: it is bounded only by wallets, days and the admin budget. It is virtual, so this is a campaign cost, not a financial one.

## Deployment order (when approved)

1. `VirtualUSDC(admin, resetOnClaim, adminSeasonBudget)`
2. `VirtualMarketRegistry(admin, vUSDC)`
3. `VirtualResolutionOracle(admin, registry, bond, challengePeriod)`
4. `VirtualMarketFactory(admin, registry, oracle)`
5. `VirtualConditionalPositions(registry)`, `VirtualExchange(registry, positions)`, `VirtualSettlement(registry, positions)`
6. Registry: grant `FACTORY_ROLE` to the factory and `ORACLE_ROLE` to the oracle.
7. Token: `allowProtocol` for positions, exchange, oracle, then `lockProtocol()`.

Verify bytecode and source on Basescan afterwards. The existing six addresses and `protocol/deployments/base-mainnet.json` are not touched.

## Not decided / not built yet

- **Who is the counterparty for an instant buy or sell?** `VirtualExchange` is a signed order book: a trade needs someone on the other side. Options: (a) a market-maker wallet that posts orders priced from the live feed, funded with its own vUSDC (admin grant); (b) a seventh contract that fills at a server-signed feed quote. Neither is written.
- Reset every season (`resetOnClaim = true`) or keep and add. Default in the tests: keep and add. Also the admin season budget (tests use 10,000 USDC).
- Monthly TAC points formula and pool (see the Season plan doc).
- App changes: box and daily check-in screens, collateral/exchange addresses, indexer and matcher configuration for the new set, "cannot be withdrawn" rules text. A Supabase migration, if needed, is applied by the owner.
- Independent review of `VirtualUSDC` before any mainnet use. Local tests are not an audit.
