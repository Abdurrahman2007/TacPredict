# Virtual USDC contract set (Base)

Status: **deployed on Base mainnet (see below), admin-controlled, trading disabled in the app.** No database setting changes.

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

Balance comes from three places only. A box, once credited, is never reversed by the contract itself; only the admin's correction tool (below) can lower a balance, and it leaves an event.

- **Welcome box, once per wallet, ever.** The platform draws a random whole-dollar amount from 50 to 500 USDC by its own choice: it does not depend on the wallet address or on anything else. The platform's **box granter** (a server wallet) credits it with `grantBox(wallet, amount)` and pays the gas, so the user signs nothing. The contract enforces the range, whole dollars, once per wallet ever, a **daily limit on boxes** (`boxDailyCap`) and the admin on/off switch. The draw itself happens off chain, so it cannot be proven on chain: use a proper random source on the server (`crypto.randomInt`), and treat the box granter key as hot. If it leaks, the daily limit bounds the damage and the admin can switch boxes off or replace the granter.
- **Daily check-in: one transaction per UTC day, signed and gas-paid by the wallet, after the box was credited.** 20, 30, 40, 50, 60, 70, 80 USDC on streak days 1 to 7, then 80 USDC a day while the streak lasts. A missed day restarts at 20. It keeps working until the admin turns it off (`setCheckInOpen(false)`); the admin can also switch the box off (`setBoxOpen`). Switches only stop new credits.
- **Admin: give, and correct.** To run campaigns and fix glitches (for example a bug that gave a wallet too much):
  - `adminGrant(wallet, amount, reasonHash)` adds any amount, 5 USDC or 10,000 USDC, as the admin chooses.
  - `adminSetBalance(wallet, target, reasonHash)` sets a wallet's balance to exactly `target`, including zero. Lowering burns the difference; raising mints it.
  - Raising is limited to **100,000 USDC per wallet per UTC day** (`ADMIN_DAILY_GRANT_CAP`). Lowering is not limited.
  - Every change is an event (`AdminGranted`, `AdminAdjusted` with the old balance, the new balance and the reason hash), and the contract keeps `totalAdminAmount` and `totalAdminBurned`, so supply always reconciles: supply = everything credited minus everything the admin lowered.
  - The admin can never change the money of the protocol contracts themselves (collateral locked in positions, oracle bonds), cannot move tokens from one wallet to another, and cannot edit positions or orders. A glitch in a position balance is outside this tool.
  - Admin handover is two-step (`proposeAdmin`, `acceptAdmin`). This is real power over everyone's virtual balance, so the admin must be a Safe multisig, and points or rankings should be computed from the event history rather than trusting a balance alone.

Other rules:

- Not transferable by users: `transfer` / `transferFrom` revert unless the caller is on the protocol list. The list is meant to hold exactly `VirtualConditionalPositions`, `VirtualExchange` and `VirtualResolutionOracle`; the admin builds it during deployment and then calls `lockProtocol()`, after which it can never change. So the balance can be traded but not sent to anyone or withdrawn.
- There are no seasons and no resets inside the contract. Monthly points are computed off chain.
- Wallets show it as `vUSDC`, not `USDC`, so it cannot be mistaken for real USDC. The app can still say "USDC" in its own text, next to "cannot be withdrawn".
- Users pay gas in ETH on Base for every check-in, buy and sell (the box costs the user nothing: the platform pays that gas). That gas is the only real money involved.
- Total supply is not capped. It is virtual, so this is a campaign cost, not a financial one.

## Deployed on Base mainnet (8453)

All seven contracts are live, admin-controlled by the Base Account `0x57828f1aa32fd6be3988f240068df53ed94b7aef`. The record (addresses, transactions, salts, initcode hashes, constructor arguments, compiler settings and the wiring) is `protocol/deployments/virtual-base-mainnet.json`; the app reads the same addresses from `src/lib/virtual-set/deployment.mjs` (a test keeps the two identical and re-derives every CREATE2 address).

| Contract | Address |
| --- | --- |
| VirtualUSDC (vUSDC) | `0xe595d15d0824705d26483c6FdABFa45693bb071e` |
| VirtualMarketRegistry | `0xCd98E90223C7E04ac7987A2fAb6a71Ba4aA6f013` |
| VirtualResolutionOracle | `0x6A22091A157013eFb7bD2388A280573662Dd5b21` |
| VirtualMarketFactory | `0xbf17837221F202CBFF642b8C049D6a4Cc1d031d8` |
| VirtualConditionalPositions | `0x4A2584bbB19fEf7df240e6d0787fd82d8175b554` |
| VirtualExchange | `0xEc947763fEe77917218732A3dcffAE0e0A40409B` |
| VirtualSettlement | `0x27eB22dF79D5aa59759c4e15a49bA1f27147ddbF` |

Settings at deployment: oracle bond 5 vUSDC, challenge period 60 seconds, `boxDailyCap` 1000, **no box granter yet** (so no welcome box can be opened until the operator sets one with `setBoxGranter`). Both the box and the check-in switches start open.

Checked onchain after deployment: each address holds code, Exchange and Settlement point at the deployed registry/positions (and vUSDC), the registry roles are held by the factory and the oracle only, the vUSDC protocol list is exactly positions, exchange and oracle, and `protocolLocked()` is true.

Deployed through the public CREATE2 proxy with the exact compiler initcode (`protocol/deployments/virtual-base-mainnet.initcode.json`, salt prefix `TacPredict.virtual.v2.`), so Basescan can match the creation code byte for byte. VirtualUSDC and VirtualMarketRegistry were deployed in their own transactions; the oracle, factory, positions, exchange and settlement went out together in one atomic batch. The first set (v1, salt prefix `TacPredict.virtual.v1.`) is deprecated and unused: nothing was minted from it and no box granter was set for it. Only this v2 set is referenced by the app.

**Status: deployed and wired, trading disabled in the app** (`VIRTUAL_SET_FLAGS.executionEnabled` is false). The project owner verified all seven contracts on Basescan with the Standard-JSON-Input package on 2026-11-06 (reported by the owner; the flag `basescanVerified` and `basescan_verified` in the manifest are now true). Execution stays off until the quote endpoint, keeper and app screens exist.

### Order the contracts were deployed in

1. `VirtualUSDC(admin, boxGranter, boxDailyCap)`
2. `VirtualMarketRegistry(admin, vUSDC)`
3. `VirtualResolutionOracle(admin, registry, bond, challengePeriod)`
4. `VirtualMarketFactory(admin, registry, oracle)`
5. `VirtualConditionalPositions(registry)`, `VirtualExchange(registry, positions)`, `VirtualSettlement(registry, positions)`
6. Registry: grant `FACTORY_ROLE` to the factory and `ORACLE_ROLE` to the oracle.
7. Token: `allowProtocol` for positions, exchange, oracle, then `lockProtocol()`.

The existing six addresses and `protocol/deployments/base-mainnet.json` are not touched.

## Market maker: instant, feed-driven prices

`VirtualExchange` is a signed order book, so every trade needs a counterparty. The platform runs a funded **market-maker wallet** that is the other side of every instant buy and sell. This is what makes the price move like a real market while nobody can lose real money: the maker plays with virtual USDC.

How a trade works (all with the unchanged six-contract set):

1. The app asks the server for a quote for one market, outcome, side and size.
2. The server reads the live feed (spot, strike, seconds left), computes the fair Up probability and signs **one order from the maker wallet**: valid for 30 seconds (never past the close), **bound to the asking wallet** (`taker`), at the maker's ask when the user buys and at the maker's bid when the user sells.
3. The user's wallet sends `fillOrder`. That is the user's own onchain transaction and the user pays Base gas. Buying and selling are both `fillOrder`; no admin or server can fill on the user's behalf.
4. The maker needs inventory: it `split`s vUSDC into complete Up and Down sets and sells from them, and `merge`s pairs back.

Pricing (`src/lib/virtual-set/market-maker.mjs`, tested):

- Fair Up probability = normal CDF of (lead over the strike) / (sigma x square root of seconds left). At the strike it is 50 cents. With the same lead, the price goes up as the clock runs down. In the last second, a lead of about two tenths of a percent is already 99 cents, and the other side is 1 cent. Prices never go outside 1 to 99 cents.
- No price is invented: if spot, strike, time or sigma is missing, there is no quote.
- The maker keeps a spread (1 cent each side by default): buying both Up and Down always costs more than one dollar, and a round trip loses exactly the spread. This, plus the short quote life, is what stops users farming free USDC.
- No quote in the last 2 seconds of a window.

What the maker costs and risks, all virtual:

- Its balance goes down when users win. Top it up with `adminGrant` (up to 100,000 USDC per wallet per day).
- A user who is faster than the maker's feed can still hit a quote for a few seconds. Keep quotes short, keep the spread, cap the size per quote, and watch the maker's PnL.
- `sigmaPpm` must be calibrated from real feed history (the examples use 380 ppm per square-root second, which is cautious). A bigger sigma keeps prices nearer 50 cents for longer.
- The maker signs with a private key held by the operator as a server secret. It is never in this repository and I never ask for it. Keep it separate from the admin (Safe multisig) and from the box granter.

## On-chain trading: BTC, ETH, SOL, BNB in 5 and 15 minute windows

Everything below lives in `src/lib/virtual-set/` and is **off until `VSET_TRADING_ENABLED=1`**. With it off the app behaves exactly as before (paper ledger).

**What the user sees** is the existing Up/Down page. With the flag on, the balance, positions, history and profit come from the chain, the welcome box and daily check-in are real contract calls, and the buy and sell buttons send real Base transactions from the user's own wallet (they need a little ETH for gas; the ticket says so). 30 minute and longer windows show "Coming soon" until they are added.

**Pieces**

| Piece | File | What it does |
| --- | --- | --- |
| Window rules | `schedule.mjs`, `market-terms.mjs` | Window grid, market terms and hashes, result rule (close above open = Up, below = Down, equal = void), box amount tiers. Pure and tested. |
| Keeper | `keeper.server.ts` | One bounded pass: approvals, create markets ahead for watched pages, stock them (`split`), propose the result from Coinbase 1 minute candles, finalize after the 60 s challenge, pay winners with `redeemFor`, index fills. A database lock keeps one run at a time. |
| Quote | `quote.server.ts` | Signs one 30 second maker order bound to the asking wallet. Refuses if the market is not open, the price is missing or the maker lacks the shares / vUSDC. |
| Trade (browser) | `wallet-trade.ts`, `trade-plan.mjs` | Approve once, fresh quote, dry-run, `fillOrder` from the user's wallet, then the server records the fill from the receipt. |
| Box | `box.server.ts` | Picks the random $50-$500 draw and sends `grantBox` from the granter wallet. |
| Account view | `portfolio.server.ts`, `ledger-view.ts` | Balance = token balance, positions = ERC-1155 balances with cost basis from indexed fills, resolved markets book a settled result. |

**Resolution source and rule.** Results use Coinbase Exchange 1 minute candles (`coinbase-exchange:<PRODUCT>:candles:60s`), open of the first candle against the close of the last candle of the window. This is a trusted resolver run by the keeper wallet (PROPOSER_ROLE), not a decentralised oracle. A tie is void (every share pays half).

**Operating it**

1. Run `supabase/migration-drafts/virtual-set-v2-trading.sql` (step 1) in the Supabase SQL editor. Step 2 in the same file schedules the keeper once a minute with pg_cron.
2. Set these Cloudflare secrets (never in git): `VSET_KEEPER_PRIVATE_KEY` (the wallet `0x1043...7515`, which is also the maker), `VSET_BOX_GRANTER_PRIVATE_KEY` (the wallet `0x0128...37E2`), `VSET_KEEPER_TRIGGER_SECRET` (any random 32+ character string, the same one used in the cron SQL). Optional: `VSET_RPC_URL` (a dedicated Base RPC is better than the public one).
3. Fund the keeper with ETH for gas (every market costs a few cheap transactions) and with vUSDC float through `adminGrant` (50,000 is the plan). The granter needs a little ETH only.
4. Set `VSET_TRADING_ENABLED=1` last.

Each secret is checked against its fixed address, so a wrong key fails loudly instead of acting as someone else. The trigger secret only starts a keeper pass; it moves no funds.

**Known limits.** One resolver (see above); the 30 second quote window is a free option for a trader faster than the feed (the spread and the per-wallet rate limit are the guard); markets with no trades are still resolved so the maker's float comes back; fee sponsorship is not built (users pay their own gas); the Workers plan must allow enough CPU time and subrequests for a keeper pass.

## Not decided / not built yet

- 30 minute, 1 hour, 12 hour and 24 hour windows on chain.
- Fee sponsorship (a paymaster for new users).
- Admin = Safe multisig (2 of 3 recommended), separate from the maker wallet and the box granter.
- After streak day 7 the check-in stays at 80 USDC a day (confirmed).
- Monthly TAC points formula and pool (see the Season plan doc). Do not tie points to the size of the box.
- Independent review of `VirtualUSDC` and the maker flow before any larger rollout. Local tests are not an audit.
