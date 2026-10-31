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

- **Welcome box, once per wallet, ever.** The platform draws a random whole-dollar amount from 50 to 500 USDC by its own choice: it does not depend on the wallet address or on anything else. The platform's **box granter** (a server wallet) credits it with `grantBox(wallet, amount)` and pays the gas, so the user signs nothing. The contract enforces the range, whole dollars, once per wallet ever, a **daily limit on boxes** (`boxDailyCap`) and the admin on/off switch. The draw itself happens off chain, so it cannot be proven on chain: use a proper random source on the server (`crypto.randomInt`), and treat the box granter key as hot. If it leaks, the daily limit bounds the damage and the admin can switch boxes off or replace the granter.
- **Daily check-in: one transaction per UTC day, signed and gas-paid by the wallet, after the box was credited.** 20, 30, 40, 50, 60, 70, 80 USDC on streak days 1 to 7, then 80 USDC a day while the streak lasts. A missed day restarts at 20. It keeps working until the admin turns it off (`setCheckInOpen(false)`); the admin can also switch the box off (`setBoxOpen`). Switches only stop new credits.
- **Admin grant:** `adminGrant(wallet, amount, reasonHash)`. At most 100,000 USDC in total per wallet (`ADMIN_ACCOUNT_CAP`); there is no global budget. Every grant is an `AdminGranted` event. The admin has no function to take, burn or edit a balance and cannot touch positions. Admin handover is two-step (`proposeAdmin`, `acceptAdmin`). Use a Safe multisig as admin: a compromised admin key could fund unlimited wallets with up to 100,000 each.

Other rules:

- Not transferable by users: `transfer` / `transferFrom` revert unless the caller is on the protocol list. The list is meant to hold exactly `VirtualConditionalPositions`, `VirtualExchange` and `VirtualResolutionOracle`; the admin builds it during deployment and then calls `lockProtocol()`, after which it can never change. So the balance can be traded but not sent to anyone or withdrawn.
- There are no seasons and no resets inside the contract. Monthly points are computed off chain.
- Wallets show it as `vUSDC`, not `USDC`, so it cannot be mistaken for real USDC. The app can still say "USDC" in its own text, next to "cannot be withdrawn".
- Users pay gas in ETH on Base for every check-in, buy and sell (the box costs the user nothing: the platform pays that gas). That gas is the only real money involved.
- Total supply is not capped: it is bounded by wallets, days and admin grants. It is virtual, so this is a campaign cost, not a financial one.

## Deployment order (when approved)

1. `VirtualUSDC(admin, boxGranter, boxDailyCap)`
2. `VirtualMarketRegistry(admin, vUSDC)`
3. `VirtualResolutionOracle(admin, registry, bond, challengePeriod)`
4. `VirtualMarketFactory(admin, registry, oracle)`
5. `VirtualConditionalPositions(registry)`, `VirtualExchange(registry, positions)`, `VirtualSettlement(registry, positions)`
6. Registry: grant `FACTORY_ROLE` to the factory and `ORACLE_ROLE` to the oracle.
7. Token: `allowProtocol` for positions, exchange, oracle, then `lockProtocol()`.

Verify bytecode and source on Basescan afterwards. The existing six addresses and `protocol/deployments/base-mainnet.json` are not touched.

## Market maker: instant, feed-driven prices

`VirtualExchange` is a signed order book, so every trade needs a counterparty. The platform runs a funded **market-maker wallet** that is the other side of every instant buy and sell. This is what makes the price move like a real market while nobody can lose real money: the maker plays with virtual USDC.

How a trade works (all with the unchanged six-contract set):

1. The app asks the server for a quote for one market, outcome, side and size.
2. The server reads the live feed (spot, strike, seconds left), computes the fair Up probability and signs **one order from the maker wallet**: valid for at most 10 seconds (never more than 30, never past the close), **bound to the asking wallet** (`taker`), at the maker's ask when the user buys and at the maker's bid when the user sells.
3. The user's wallet sends `fillOrder`. That is the user's own onchain transaction and the user pays Base gas. Buying and selling are both `fillOrder`; no admin or server can fill on the user's behalf.
4. The maker needs inventory: it `split`s vUSDC into complete Up and Down sets and sells from them, and `merge`s pairs back.

Pricing (`src/lib/virtual-set/market-maker.mjs`, tested):

- Fair Up probability = normal CDF of (lead over the strike) / (sigma x square root of seconds left). At the strike it is 50 cents. With the same lead, the price goes up as the clock runs down. In the last second, a lead of about two tenths of a percent is already 99 cents, and the other side is 1 cent. Prices never go outside 1 to 99 cents.
- No price is invented: if spot, strike, time or sigma is missing, there is no quote.
- The maker keeps a spread (1 cent each side by default): buying both Up and Down always costs more than one dollar, and a round trip loses exactly the spread. This, plus the short quote life, is what stops users farming free USDC.
- No quote in the last 2 seconds of a window.

What the maker costs and risks, all virtual:

- Its balance goes down when users win. Fund it with `adminGrant` (100,000 USDC per wallet in total, so plan for rotating to a fresh maker wallet or topping up from several).
- A user who is faster than the maker's feed can still hit a quote for a few seconds. Keep quotes short, keep the spread, cap the size per quote, and watch the maker's PnL.
- `sigmaPpm` must be calibrated from real feed history (the examples use 380 ppm per square-root second, which is cautious). A bigger sigma keeps prices nearer 50 cents for longer.
- The maker signs with a private key held by the operator as a server secret. It is never in this repository and I never ask for it. Keep it separate from the admin (Safe multisig) and from the box granter.

## Not decided / not built yet

- The quote endpoint, the keeper that creates a market per asset and window and resolves it, the indexer/matcher configuration for the new set, and the app screens (box reveal, daily check-in, trade card) are not written. No deployment.
- After streak day 7 the check-in stays at 80 USDC a day (confirmed).
- Admin = Safe multisig (2 of 3 recommended), separate from the maker wallet and the box granter.
- Monthly TAC points formula and pool (see the Season plan doc). Do not tie points to the size of the box.
- Independent review of `VirtualUSDC` and the maker flow before any mainnet use. Local tests are not an audit.
