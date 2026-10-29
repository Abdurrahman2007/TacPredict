# Audit: Live trading is off-chain (paper) — on-chain Virtual USDC path

**Date:** 2026-10-29  
**Scope:** Production UI (`tacpredict.fun`) + repo `main` after PR #27  
**Networks:** Base Mainnet 8453 (six legacy contracts) · Base Sepolia 84532 (VirtualPriceAMM QA)

---

## 1. Verdict (live Buy/Sell path)

| Question | Answer |
|---|---|
| Does each Buy/Sell send a Base transaction? | **No** for Up/Down home/detail. Trades hit `localStorage` paper ledger only. |
| Contract address / function | **None** on the live Up/Down path. |
| Positions / PnL source | `tac-paper-ledger-v2` in the browser — **not** chain events. |
| Off-chain code path | `PaperAmountCard` → `usePaperLedger().buy/sell` → `src/lib/paper/ledger.ts` |
| On-chain path that already exists (unused by Up/Down) | `VirtualAmountCard` → `prepareVirtual` → `executeVirtualTrade` → engine `buy`/`sell` + `TradeExecuted` receipt verify |

**Routing:** `PredictionAmountCard` uses `VirtualAmountCard` only when `market.virtual` is set. Up/Down builds `reference-*` markets **without** `virtual`, so they always take the paper card.

---

## 2. Deployed contracts (verified)

### A) Six Base Mainnet contracts (legacy CLOB / native USDC)

- Source: `protocol/deployments/base-mainnet.json`
- `trading_enabled: false`, `verified: true`
- Collateral assumption: **native USDC** (`0x8335…`), not Virtual USDC
- **Do not modify, unpause, or redeploy** for this product path

### B) VirtualPriceAMM — Base Sepolia (separate engine)

| Field | Value |
|---|---|
| Engine | `0xCF59F3Ff524cC1bD4e11177937D3BCBE62860E46` |
| Chain | **84532** |
| Runtime codeHash | `0xbcc5446f4cb392475d4c7a98bb1d3c1948b3d345e2410c84cabdc0e109113535` |
| Trade functions | `buy(...)` / `sell(...)` — **separate txs** (`oneTrade` latch) |
| Event | `TradeExecuted` |
| Virtual USDC | Non-transferable accounting via `cash` / campaigns — **no real-USDC deposit/withdraw** |
| QA evidence | `protocol/virtual/launch/approved-sepolia/qa-verified-0x6397.json` (createPool→Buy≠Sell hashes) |

Mainnet VirtualPriceAMM: **not deployed**. CREATE2 prep only under `launch/price-mainnet/` (unsigned).

---

## 3. Pricing (5m / late window)

Off-chain mirror: `src/lib/paper/feed-v1-quote.ts` (matches VirtualPriceAMM probability math).

Observed with current defaults (`sigmaPpm=900` for 5m):

| Spot vs strike | t_remaining | Favoured side ¢ |
|---|---|---|
| +1% @ 21s | 21 | ~84¢ |
| +2% @ 21s | 21 | ~91¢ |
| +5% @ 21s | 21 | ~96¢ |

So **90–95¢ is already reachable** when the move is strong; mild +1% moves stay lower. Not hardcoded. Gap vs user intent: short-window sigma may need calibration so *strongly* favoured late states hit ~90–95 more often without inventing winners.

UI odds: `spotShareOdds` → feed-v1. Contract executable prices (when wired): `quoteBuy` / `quoteSell` / `probability` on VirtualPriceAMM — must stay in parity.

---

## 4. Exact files that must change (smallest safe set)

| File | Change |
|---|---|
| `src/components/prediction-amount-card.tsx` / up-down detail | Route to on-chain card when virtual market binding exists |
| `src/lib/virtual/*` (execution, trade.server, read, hooks) | Already on-chain; bind Up/Down markets + Sepolia RPC |
| `src/lib/paper/ledger.ts` + `paper-amount-card.tsx` | Remain as **fallback display-only** or staging demo — never claim on-chain |
| Keeper (`keeper-loop.mts`, lifecycle) | `createPool` / `captureStart` / `proposeFromFeed` / `finalize` per window |
| Indexer + `VIRTUAL_TRADING_CONFIG` | Map `reference-{asset}-{open}-{min}` → on-chain `marketId` |
| `feed-v1-quote.ts` + contract policy | Calibrate short-window σ for late 90–95¢ when data justifies |
| Production env | `VIRTUAL_TRADING_CONFIG`, Sepolia/Mainnet RPC — **Mainnet `enabled:false` until approval** |

**Do not** change the six Mainnet contract sources or addresses.

---

## 5. Architecture proposal (phased)

### Phase 0 — Truth in UI (immediate)
- Label Up/Down paper trades as **Virtual USDC · paper (not on-chain)** until bound.
- Never show a fake tx hash.

### Phase 1 — Sepolia continuous windows (implementation target)
1. Keeper creates VirtualPriceAMM pools for upcoming BTC/ETH/SOL/BNB × durations (incl. 5m) with MockFeed or approved fast oracle when available.
2. Indexer publishes `market.virtual` metadata (engine, marketId, codeHash, chainId=84532).
3. Up/Down detail uses `VirtualAmountCard` → wallet `buy`/`sell` → wait receipt → verify `TradeExecuted` → refresh portfolio from indexer/chain.
4. Quotes: server `prepareVirtual` reads on-chain `quoteBuy`/`quoteSell`; UI mid from feed-v1 must not silently diverge (show “estimate” vs “executable”).
5. Campaign grants for Virtual USDC: **separate approval** (Merkle) — not auto Mainnet.

### Phase 2 — Settlement keeper
- Independent process: captureStart → proposeFromFeed → finalize → user settle.
- Idempotent keys, retries, alerts. Prove on Sepolia before claiming auto-settlement.

### Phase 3 — Mainnet VirtualPriceAMM (blocked)
- Separate written approval + deploy plan only.
- Production execution requires `chainId === 8453`, codeHash pin, `enabled:true`.
- Six legacy contracts stay paused/untouched.

---

## 6. Risks / limitations

- Chainlink heartbeats are too slow for reliable **on-chain** 5m boundaries on Mainnet → need approved low-latency oracle or accept paper-only 5m until then.
- Sepolia currently uses **MockFeed** for QA — not production oracle truth.
- Indexer/Supabase checkpoint required for catalogue; without it `VirtualAmountCard` markets won’t appear.
- Gas: each Buy and each Sell is a full L2 tx (user-paid).
- High “simulated traffic” must not fake volume: show paper volume separately from on-chain volume.

---

## 7. Acceptance criteria (not met on live yet)

- [ ] Each Buy has Base tx hash + `TradeExecuted`
- [ ] Each Sell is a **different** tx hash + `TradeExecuted`
- [ ] Portfolio positions/PnL from indexed events reconciled to contract
- [ ] No silent paper fallback after a failed wallet tx
- [ ] Late 5m quotes can reach ~90–95¢ when model+data support (not hardcoding)
- [ ] Mainnet VirtualPriceAMM only after explicit approval
