# Live charts, sports Markets and public admin tabs

## Delivered

- Home plot scrubbing is interactive instead of being covered by the card navigation link. Mouse, touch pointer capture, keyboard arrows and Escape inspect nearest real observations. The title, card background and Up/Down links still navigate.
- Short price charts show at least 30 minutes of observed context while the prediction round remains 5 minutes. Real Coinbase USD candle/trade history and one shared ticker connection cover BTC, ETH, SOL and BNB. CoinGecko remains a sampled fallback; sources are not spliced together or used to replace locked settlement evidence.
- Candles use actual OHLC and only real post-snapshot ticks; empty minutes are not filled. Short chart requests use 1-minute candles; the 24-hour request uses 5-minute candles to stay within the provider's 300-candle bound.
- Home includes 5-minute, 1H and 24H cards for all four assets. Desktop places 1H and 24H groups side by side. 1H is display-only: supported pool durations, contract code, deployment flags and transaction guards are unchanged.
- Markets filters native and discovered listings to Football/Cricket and removes crypto previews. Existing crypto markets remain accessible by their own links; none are deleted.
- Local Football/Cricket category logos provide a reliable fallback when no working source/team image exists. These are category illustrations, not invented official team crests. Unknown quote boxes no longer appear as empty blocks; no probabilities are invented.
- Admin → Market engine → Home & Markets mirrors the shared Home feed tabs, Markets sort tabs and sports categories, with real listing filters and links to the 12 crypto price views. It inherits the existing protected admin shell; no access changes.
- Portfolio removes the marked Base Mainnet caption, calculation disclosure and Updated since date control. Wallet balances, network mismatch warnings, value-source tooltip, orders and private position authentication remain intact.

## Validation

- Typecheck and changed-source lint.
- 173 fast regression tests passed before final copy/CSS refinement; targeted source and chart tests rerun for the release.
- Real public data in browser QA at 320, 390 and 1280px: 12 Home cards, distinct first/middle/last real scrub observations, 1H navigation/candles, sports-only Markets, marked portfolio removals, no horizontal page overflow or page errors.
- Real touch events changed selected price/time without navigating away from Home.
- Local-only fixture harness checked category logo loading and admin category/sort filtering at all three widths. No fixture market was written to production; the harness was removed before build.
- No secret, signer, contract, market publication, trading activation or financial-state change is part of this update.
