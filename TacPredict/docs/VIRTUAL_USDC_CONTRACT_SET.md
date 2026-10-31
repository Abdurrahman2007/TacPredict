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

Balance comes from three places only. Nothing is ever burned from a wallet and nothing can be reversed.

- **Welcome box, once per wallet, ever.** A whole-dollar amount from 50 to 500 USDC. It is fixed per wallet by a hash (`boxAmount(wallet)`, a free read), so the app can play the box opening with no transaction. It is credited by `claimBox(wallet)`, which anyone can call (the platform may pay that gas for new users), or automatically inside the wallet's first `checkIn()`. A second claim always reverts.
- **Daily check-in: one transaction per UTC day, signed and gas-paid by the wallet.** 20, 30, 40, 50, 60, 70, 80 USDC on streak days 1 to 7, then 80 USDC a day while the streak lasts. A missed day restarts at 20. It keeps working until the admin turns it off (`setCheckInOpen(false)`); the admin can also switch the box off (`setBoxOpen`). Switches only stop new credits.
- **Admin grant:** `adminGrant(wallet, amount, reasonHash)`. At most 100,000 USDC in total per wallet (`ADMIN_ACCOUNT_CAP`); there is no global budget. Every grant is an `AdminGranted` event. The admin has no function to take, burn or edit a balance and cannot touch positions. Admin handover is two-step (`proposeAdmin`, `acceptAdmin`). Use a Safe multisig as admin: a compromised admin key could fund unlimited wallets with up to 100,000 each.

Other rules:

- Not transferable by users: `transfer` / `transferFrom` revert unless the caller is on the protocol list. The list is meant to hold exactly `VirtualConditionalPositions`, `VirtualExchange` and `VirtualResolutionOracle`; the admin builds it during deployment and then calls `lockProtocol()`, after which it can never change. So the balance can be traded but not sent to anyone or withdrawn.
- There are no seasons and no resets inside the contract. Monthly points are computed off chain.
- Wallets show it as `vUSDC`, not `USDC`, so it cannot be mistaken for real USDC. The app can still say "USDC" in its own text, next to "cannot be withdrawn".
- Users pay gas in ETH on Base for every check-in, buy and sell (the box costs the user nothing if the platform sponsors it). That gas is the only real money involved.
- **The box is pseudo-random, not tamper-proof.** The amount depends only on the wallet address and a salt fixed at deployment, so someone can search offline for an address with a high box. Points and ranking must not depend on the size of the box (for example score PnL as a percentage and cap volume).
- Total supply is not capped: it is bounded by wallets, days and admin grants. It is virtual, so this is a campaign cost, not a financial one.

## Deployment order (when approved)

1. `VirtualUSDC(admin)`
2. `VirtualMarketRegistry(admin, vUSDC)`
3. `VirtualResolutionOracle(admin, registry, bond, challengePeriod)`
4. `VirtualMarketFactory(admin, registry, oracle)`
5. `VirtualConditionalPositions(registry)`, `VirtualExchange(registry, positions)`, `VirtualSettlement(registry, positions)`
6. Registry: grant `FACTORY_ROLE` to the factory and `ORACLE_ROLE` to the oracle.
7. Token: `allowProtocol` for positions, exchange, oracle, then `lockProtocol()`.

Verify bytecode and source on Basescan afterwards. The existing six addresses and `protocol/deployments/base-mainnet.json` are not touched.

## Not decided / not built yet

- **Who is the counterparty for an instant buy or sell?** `VirtualExchange` is a signed order book: a trade needs someone on the other side. Options: (a) a market-maker wallet that posts orders priced from the live feed, funded by an admin grant; (b) a seventh contract that fills at a server-signed feed quote. Neither is written.
- After streak day 7 the check-in stays at 80 USDC a day (alternative: restart at 20).
- Monthly TAC points formula and pool (see the Season plan doc).
- App changes: box and daily check-in screens, collateral/exchange addresses, indexer and matcher configuration for the new set, "cannot be withdrawn" rules text. A Supabase migration, if needed, is applied by the owner.
- Independent review of `VirtualUSDC` before any mainnet use. Local tests are not an audit.
