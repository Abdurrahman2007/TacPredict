# Feed-price prototype — review only, not launch approval

New source `contracts/VirtualPriceAMM.sol`; old `VirtualAMM.sol` and six legacy contracts are unchanged. Compatible buy/sell/receipt/account getters let the existing amount card and transaction flow remain in place. `model: "feed-v1"` is an explicit future deployment setting, not an active production setting. New binary engine is for crypto, not arbitrary sports payout rules; the existing 2/3-outcome virtual FPMM remains separate.

## Exact model

All money/shares use 1e6 atoms; feed prices use that feed's frozen decimals. Positive price ratios cancel the feed decimal scale. For spot S, captured start K, remaining seconds t and frozen per-sqrt-second volatility sigmaPpm:

- d = trunc((S - K) * 1e6 / K).
- v = sigmaPpm * ceil(sqrt(t)).
- adjustment = floor(500000 * abs(d) / (abs(d) + v)).
- pUp = 500000 + sign(d)*adjustment + inventorySkew, clipped to [minProbabilityPpm, 1e6-minProbabilityPpm].
- inventorySkew = clamp((reserveDown-reserveUp)*skewPpm/seed, +/-skewPpm).
- ask = pOutcome + spreadPpm + floor(cashInput*impactPpm/seed).
- bid = pOutcome - spreadPpm - floor(shareInput*impactPpm/seed).
- Buy: fee = ceil(cashInput*feeBps/10000); sharesOut = floor((cashInput-fee)*1e6/ask).
- Sell: gross = floor(sharesIn*bid/1e6); fee = ceil(gross*feeBps/10000); cashOut = gross-fee.

This is a transparent **rational probability approximation**, not a normal-CDF/calibrated forecast or guaranteed fair value. Volatility is frozen per market, not fabricated or silently recalibrated. Calibration and choice of sigma/spread/impact/budgets require economic review and owner approval. Spread must be at least maximum inventory skew; this bounds a fixed-spot inventory roundtrip incentive, but is not a proof of manipulation resistance. Splitting/latency/MEV/Sybil risks remain review items.

Finite inventory invariant: reserve[j] = collateral - total outstanding shares[j]. A buy adds net cash to collateral and all reserves, subtracting issued shares from the selected reserve. A sell reverses that accounting. Each reserve must stay above reserveFloor and within uint64, with per-trade and per-wallet position caps. Invalid/out-of-range prices, exhausted inventory or an ask >= 1 / bid <= 0 revert. No guaranteed sell liquidity, partial automatic fills or unlimited virtual minting. Total cash + collateral + fees + retired accounting = approved seed + actual grants.

Existing minOut, revision, deadline and wallet nonce are enforced onchain; current feed price is recomputed during execution, so simulation is not execution. EIP-1153 oneTrade rejects multiple engine trades in one transaction even across bundled UserOperations. Normal direct wallet transactions remain the intended initial execution route.

Realized PnL = sell proceeds minus removed proportional cost basis (all remaining basis removed on full close). Mark value is probability-mid times shares, **not an executable liquidation quote**, and excludes bid spread/impact. Expired/unresolved or stale marks may be unavailable rather than fake zero. Winning shares pay 1 Virtual USDC, losing pay zero in this binary engine. Void pays 1/2 per binary share, not original purchase-cost refund. Existing three-outcome FPMM void uses 1/3 per share; do not substitute binary rules for sports/other markets.

## Source, boundary and resolution

AggregatorV3-compatible onchain price feed, immutable per-market policy. Validate round/answer/answeredInRound/timestamp, min/max underlying value, maxAge, sequencer up plus >3600-second recovery grace. No fallback from execution feeds to Coinbase charts/CoinGecko or an admin-provided spot number. Frontend live/chart providers are **reference only** and cannot authorize execution/settlement.

`captureStart` freezes the first round at/after open, requiring its valid predecessor before open and capture within the policy tolerance. Proposer `proposeFromFeed` must use the first round at/after close with predecessor before close. Phase transitions, missing predecessors, invalid values or no timely boundary fail closed; no selecting a later favourable round. Tie policy and asset must match frozen metadata and onchain price-policy hash. Ordinary `propose` is disabled in the new engine. Authorized watcher can dispute; only arbiter can adjudicate a dispute after the challenge window. No ordinary app-admin bypass. Timeout-void remains permissionless after the resolution deadline. Published terms/policy cannot be edited once configured/open.

**Launch-blocking provider mismatch:** published Base directory heartbeats are 1200s for inspected BTC/ETH feeds and 86400s for inspected SOL/XRP/BNB feeds. Heartbeat is a maximum interval, not guaranteed tick frequency; deviation updates can be faster. Read-only probe observed some samples older than 5 minutes. A 5-minute market cannot rely on those feeds always delivering fresh/timely boundaries. Increasing maxAge/tolerance to hide this is not a fix. Choose and validate a fast verifiable oracle/provider (and its fees/licence) before enabling short markets. If an attested/pull-oracle path is chosen, implement and audit its report/signature/replay/fee handling separately; do not silently treat this aggregator prototype as supporting it.

Sources: https://docs.chain.link/data-feeds/price-feeds/addresses?network=base&page=1 and https://reference-data-directory.vercel.app/feeds-ethereum-mainnet-base-1.json . `feed-probe.json` records public read-only observations and source URL; no addresses from it are enabled in runtime configuration.

## Operations and costs

No TacPredict transaction is sent on every feed update; view calls read provider state. Each user trade is its own transaction. Opening a market, freezing policy, capturing start and proposing/finalizing/settling are separate operational actions, requiring authorized submission and gas where applicable. Pure `lifecyclePlan`/`futureWindows` prepare bounded idempotent work; **no production keeper/signer/cron is registered**. A continuous, secured operator and staging validation remain outstanding.

Public chart endpoints may be rate-limited/unavailable (including BNB product availability). Coinbase WebSocket reconnects/polls; stale/invalid/future/out-of-order samples are rejected and not restamped as fresh. CoinGecko optional reference history requires COINGECKO_DEMO_API_KEY. Commercial fast-oracle/RPC pricing and feed licensing are unverified; obtain quotes, no invented monthly price. Five-second polling means 17,280 refreshes/day per continuously active view before cache/coalescing and multiple RPC reads per catalogue refresh; production shared caching/rate limits/provider quota validation are still required. Local mock-feed gas evidence is not a Mainnet gas quote. Wallet gas display separates execution estimate from additional Base L1 data fees.
