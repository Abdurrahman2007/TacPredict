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
