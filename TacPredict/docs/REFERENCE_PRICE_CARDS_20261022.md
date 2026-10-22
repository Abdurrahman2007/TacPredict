# Reference-style price cards and time history

## Delivered

- Real React/CSS/SVG cards based on the supplied layout; no screenshot is embedded. Existing installed token logos are reused.
- The stretched semantic link makes the whole card open its prediction detail. Up/Down retain separate direction links. Missing order-book prices produce clean direction labels, never invented cents or probabilities.
- Compact logo/title/window/countdown, reference and current observations, an observed-price line, and large direction actions. Provider branding is absent from the card. Unknown listing odds are omitted rather than shown as repeated error text.
- Detail navigation no longer blocks on an indexer/database preload. Price labels are short, rules are collapsed, Past windows open above the fixed trade bar, and position/history tabs remain usable.
- A line/sampled-candle switch uses only actual observed points. Sampled candles are grouped observation OHLC, NOT exchange tick-complete candles or settlement evidence. Missing intervals are never filled.
- Admin Crypto Up/Down includes an eight-row UTC time-history table with duration/date filters, Earlier/Later/Now controls and round links within the supported detail range. Schedule-only rows are distinguished from indexed markets and finalized on-chain pool readings. No funded round or outcome is inferred from elapsed time. Provider/read failures are not converted into zeros or settled results.

## Provider and financial boundaries

Public production requests for the configured price service returned observations for BTC, ETH, SOL and BNB during diagnosis. `Up Unavailable` was a missing native prediction quote, not a spot-price API key failure. No key was retrieved, changed or exposed.

Cards share the existing server-cached price queries. Reference start prices use the first actual sample at/after the window boundary within three minutes, not a preceding sample or interpolation. Before a qualifying reading exists, the detail shows Pending and the card labels its historical chart Start instead of claiming a round-start price. Recent-history axes retain their real timestamps.

A native CLOB detail still uses its Coinbase evidence for its price-to-beat/current values and chart. A configured pool detail uses the round's reported on-chain start/end values, never a display sample as a replacement. No contract, oracle rule, treasury, payout, pause state or activation flag changed. This release does not activate trading.

## Validation

- TypeScript and changed-source lint passed with zero errors.
- 166 fast regression tests passed, including exact/non-future boundaries, first eligible reference samples, sampled OHLC, UTC history alignment, non-overlapping pages, no fabricated settlement and nonblocking navigation. These tests are included in the CI command where relevant.
- Local Home-card/detail QA at 320/390/1280 pixels used recorded public production observations, not fabricated fixture prices. Whole-card navigation, real price rendering, line/candle toggle, Past links, no page errors and no page overflow passed. Missing/native-market paths remain fail-closed.
- Admin time-history component QA at 390/1280 passed for row count, pagination and page overflow. This was a local component harness, not a claim of authenticated production-admin E2E or a funded Mainnet test.

## Time control refinement

Past opens an accessible bottom sheet. Each historical time links to its selected window; unknown results remain neutral rather than invented. Only current and next windows appear beside Past. Live view follows the UTC boundary every second; fixed historical selections stay fixed. Keyboard Escape restores focus. Checked at 320, 390 and 1280px, including a five-minute rollover and history selection.
