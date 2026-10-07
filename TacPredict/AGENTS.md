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
