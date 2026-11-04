<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Architecture decisions

- The public product uses a shared prediction-first shell with Home, Markets, Rewards, and Profile because legacy features must not define primary navigation.
- Market data contracts live under `src/domain/markets` because all categories and binary or multi-outcome markets share one category-independent model.
- External market-price credentials and requests must stay behind server functions because provider keys cannot ship to browsers.
- CoinGecko market snapshots use a shared server cache and request deduplication because live cards must not create duplicate provider calls.
- Polymarket discovery and crypto Up/Down odds use one shared cached server feed because displayed probabilities must come from the provider rather than price-change estimates.
- The current product direction is Base plus native USDC, with purple/graphite styling based on the supplied TacPredict mascot and wallet-first portfolio navigation.
- Base wallet state uses BaseWalletProvider. The legacy TAC Points provider is isolated to old auth/rewards routes; it must never be represented as USDC or onchain settlement.
- Real prediction transactions remain disabled until Base market contracts, ABIs, indexer and resolution/settlement paths have been supplied and validated.

## Base-first implementation references

- Use https://base.org/build and other base.org product pages for first-party context, then https://docs.base.org/llms.txt to discover the current implementation guide. Prefer Markdown documentation, especially https://docs.base.org/get-started/connect-to-base.md and https://docs.base.org/specifications/reference/smart-contracts.md.
- This app is TanStack Start/React, not the Next.js application that generates Base's website AGENTS.md. Do not copy Base's generator path or overwrite this project's instructions with that generated website file.
- Production is Base Mainnet 8453 and native six-decimal USDC. Base Sepolia 84532 is isolated testing, never evidence of a funded Mainnet end-to-end run. Use RPC and explorers to verify execution/state after consulting first-party guidance.
- Never turn a missing price, balance, share count, probability, history or runtime observation into a verified zero. Keep wallet cash, position valuation, cost basis and claimable payouts distinct. A last trade is not an executable quote.
- CLOB Exchange and UpDownPool are separate protocols with separate deployment, oracle/reporter, funding and release requirements. `node protocol/scripts/check-launch-readiness.mjs` only observes CLOB release evidence and never activates trading. No private key, automated signer, infinite approval or production flag may be introduced as a shortcut around missing evidence.

## Virtual-only phase (2026-11-04 cleanup, branch feature/virtual-only-cleanup)

- Public product in this phase is crypto-only Up/Down (BTC, ETH, SOL, BNB) in
  5m, 30m, 1h, 12h and 24h windows. The public Markets list is removed; the
  navigation is exactly Home, Rewards, Ranking, Portfolio. Admin market tooling
  and market data libraries are kept, but public `/markets` routes and links
  are gone — do not re-add a public Markets page without a new decision.
- Onchain Virtual USDC stays on Base Mainnet (8453), NOT Sepolia. The token is
  virtual and non-redeemable, but every onchain buy/sell/settle still needs a
  real wallet signature and real ETH gas on Mainnet — every onchain virtual
  ticket must say so prominently. Paper trades are gas-free and labelled paper.
- Real-USDC pool trading stays hard-blocked. Operator/pool-admin Mainnet
  signing is disabled unless the non-default build flag
  VITE_ENABLE_OPERATOR_SIGNING=true is set; admin gating around it is unchanged.
- Paper localStorage balances must never feed rewards, rankings or payouts.
  Paper PnL is labelled paper/unsettled until server settlement exists.
- TAC Points are points only, not USDC and not a token. They may be considered
  for a future token/airdrop only if announced; no token, airdrop, price or
  date is promised. This does not override the Terms page, which promises no
  future TAC token.
- Fees/sponsor work is deferred: no sponsor logic, fee subsidy or low-fee
  promise exists in this phase, and none may be shown in UI copy.
- Design: iOS-native feel — system font stack, large soft-rounded cards,
  transform/opacity motion only, backdrop blur on header/bottom nav only,
  44px hit targets, browser zoom enabled, prefers-reduced-motion respected.
- Missing values show as unavailable (— / Unavailable), never as a verified
  zero, except where a zero is verified. This supersedes any older doc line
  that says balances display 0 until a verified amount arrives.
  (Portfolio stats are the one exception, per owner instruction: they show
  0, not —, when disconnected or empty.)
- Wallet connect is once-only: wagmi persists the connection in localStorage
  and auto-reconnects on mount, but the app must never show a "Connect
  wallet" control while that restore is still in flight. BaseWallet
  `restoring` is true until the bridge reports a definitive connected or
  disconnected state (with a 10s fallback); while restoring, headers,
  Portfolio, Rewards and all gated actions show a neutral loading state
  and `useLoginDialog()` never opens the connect modal. A connected wallet
  gets at most one SIWE signature per fresh connect/session; a restored
  connection never opens a popup.
