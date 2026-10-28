# Live prediction pricing — deliverable (Draft PR)

**Branch:** `feature/live-prediction-pricing-expiry`  
**Status:** Safe coding + paper/local validation. **No Base Mainnet deploy. No campaign activation.** Stop before production; explicit approval required.

## 1. Implementation summary

- Wired Up/Down ¢ to **feed-v1** (mirror of `VirtualPriceAMM.probability`): spot vs strike, √(time remaining), frozen σ, inventory skew, min probability.
- Home + detail use live Coinbase WS price with REST fallback; reject null/invalid inputs (no fabricated ¢).
- Removed fake “Virt. liq” pools; volume = real paper ledger notional only.
- Paper Buy shows **To win / Profit if win**; Sell + Positions show **unrealized PnL**; Portfolio shows **realized PnL** + trade history.
- Paper markets reject Buy after `endsAt`; past windows **idempotently settle** (win $1, lose $0, tie **void $0.50**).
- Durations now **5 / 15 / 30 / 60 / 720 / 1440** minutes; scheduler `futureWindows` covers BTC/ETH/SOL/XRP/BNB × six intervals.
- Existing `VirtualPriceAMM`, operator planner, Chainlink policy checks, and six legacy Base Mainnet contracts are **unchanged / not redeployed**.

## 2. Pricing formula (feed-v1)

See also `protocol/virtual/launch/final-review/PRICING.md`.

- `d = trunc((S−K)·1e6 / K)`
- `v = σ_ppm · ceil(√t)` with `t` = seconds to close
- `adj = floor(5e5 · |d| / (|d|+v))`
- `pUp = clip(5e5 ± adj + inventorySkew, [minPpm, 1e6−minPpm])`
- `pDown = 1e6 − pUp`
- Ask/bid add/subtract `spreadPpm + impact`; fee = `ceil(amount·feeBps/10000)`
- **Tie:** `tieVoids=true` → void @ $0.50/share (not silent win/loss)

Frontend paper ¢ are **estimates** of that model. Executable quotes on Sepolia/mainnet remain contract `quoteBuy` / `quoteSell`.

## 3. Price providers

| Role | Source | Notes |
|------|--------|--------|
| Display / paper | Coinbase WS + REST ticker | Stale/future/OOO ticks rejected in `live-prices.ts` |
| Charts | Coinbase candles (+ optional CoinGecko history) | Reference only |
| On-chain settlement | Chainlink AggregatorV3 on Base | BTC/ETH/SOL/BNB configured; **no Base XRP feed** |

Freshness: use feed `recommendedMaxAgeSeconds` (≤1200s BTC/ETH; ≤3600s SOL/BNB). Short 5m markets are **blocked for production Chainlink settlement** until a fast oracle is approved (documented in PRICING.md).

## 4. Market lifecycle

1. `futureWindows` → unique `asset:interval:start` keys  
2. Operator `lifecyclePlan`: `captureStart` → trade → `proposeFromFeed` → challenge → `finalize` / `timeoutVoid`  
3. `planVirtualOperatorActions` builds **unsigned** calldata only — no auto-signer in production  
4. Paper path: client settle after verified start/end prices; no chain tx  

**Gas:** settlement txs paid by authorized operator wallet (Sepolia/mainnet when approved). Retries keyed by `idempotencyKey`.

## 5. Security / blockers

- Do not modify/redeploy the six existing Base Mainnet contracts.
- Virtual USDC remains non-redeemable.
- XRP: UI paper OK; **no Chainlink Base feed** → no feed-v1 on-chain for XRP.
- 5m Chainlink heartbeat vs window length: production short markets need faster oracle.
- No production keeper registered; operator must be authorized separately.
- Monthly campaigns stay inactive until approved.

## 6. Env / permissions

- `VIRTUAL_RPC_URL` (server) for Chainlink reads  
- Optional `COINGECKO_DEMO_API_KEY` for history  
- Sepolia: deployment JSON under `protocol/virtual/launch/approved-sepolia/`  
- Roles: CREATOR / PROPOSER / WATCHER / ARBITER / GUARDIAN — never ship admin keys to frontend  

## 7. Launch checklist (approval required before each step)

1. [ ] Review feed-v1 parity tests green  
2. [ ] Sepolia VirtualPriceAMM deploy (if not already) — **no mainnet**  
3. [ ] Fund Sepolia operator; dry-run `planVirtualOperatorActions`  
4. [ ] Private canary trades: separate Buy then Sell txs; verify receipts  
5. [ ] Expiry + proposeFromFeed + settle idempotency  
6. [ ] Explicit written approval for any mainnet / public trading / campaigns  

## 8. Contracts vs requirements

| Requirement | Existing support |
|-------------|------------------|
| Binary Up/Down + feed pricing | `VirtualPriceAMM.sol` (new engine; not the six legacy) |
| Separate Buy/Sell + oneTrade | Yes |
| Capture start / propose from feed | Yes |
| Tie void | `tieVoids` policy |
| Six legacy Mainnet contracts | **Do not use for this product path**; leave untouched |
| Fast 5m oracle | **Gap** — needs new approved provider before short mainnet markets |
