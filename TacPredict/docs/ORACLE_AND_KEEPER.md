# Oracle + keeper design (Draft PR #27 follow-up)

**No Base Mainnet oracle/trading deploy without separate approval.**

## Display vs settlement

| Layer | Source | Use |
|-------|--------|-----|
| Charts / live ¢ estimates | Coinbase WS + REST | UI only |
| On-chain settlement | Chainlink AggregatorV3 (BTC/ETH/SOL/BNB) | VirtualPriceAMM `captureStart` / `proposeFromFeed` |
| Short windows (5/15/30m) | *Pending* pull oracle | Paper trades allowed; **on-chain settlement blocked** |
| XRP | No verified Base Aggregator | **Charts only** — trading disabled until approved feed |

Coinbase ticks are **not** trustless settlement inputs.

## Start / expiry capture (Chainlink path)

1. First Aggregator round with `updatedAt >= boundary` and predecessor `updatedAt < boundary` within `boundaryTolerance`.
2. Validate answer > 0, answeredInRound, sequencer up + grace.
3. Reject stale (`block.timestamp - updated > maxAge`), future timestamps, out-of-order rounds.
4. Missing/invalid boundary → **pause** (timeout-void) — never invent a price.

## 5-minute problem

Chainlink heartbeats (BTC/ETH ~1200s; SOL/BNB up to 86400s) cannot guarantee fresh boundaries for 5m markets. Options under evaluation (fees TBD — obtain vendor quotes):

- **Pyth / RedStone** pull reports with publishTime
- **Chainlink Data Streams** (if Base licensing available)

Until one is approved + audited + wired, short markets stay **paper_only**.

## XRP

Kept in UI (charts, countdown). Footer: “Charts only”. Trade sheet: Unavailable.  
Later: vendor XRP/USD on Base → signed-report adapter → Sepolia E2E → Mainnet approval. See `XRP_FOLLOWUP` in `oracle-policy.ts`. **Never fabricate a feed address.**

## Keeper

- Planner: `lifecyclePlan` + `planVirtualOperatorActions` (unsigned calldata)
- Loop: `protocol/virtual/scripts/keeper-loop.mts` (dry-run by default)
- Idempotency: `idempotencyKey = marketId:action` via `runKeeperTick`
- Submit: Sepolia/`31337` only when `VIRTUAL_KEEPER_SUBMIT=true`; **Mainnet blocked in code**
- Gas: authorized operator EOA (PROPOSER/CREATOR); fund via Sepolia faucet; alert on low balance
- Price ticks **never** create txs

Production cron/supervisor registration still requires ops approval (host, secrets, pager).

## PAT rotation (security)

1. GitHub → Settings → Developer settings → Personal access tokens → **revoke** the exposed token.
2. Create a **new** fine-scoped token (or SSH / `gh auth login`); never put it in the remote URL.
3. Local remote is scrubbed to `https://github.com/Abdurrahman2007/TacPredict.git`.
4. Do not reuse the old token.
