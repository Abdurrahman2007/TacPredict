# Base / USDC preview deployment

Project root: `TacPredict/`. Install with `npm ci`, check with `npx tsc --noEmit`, build with `npm run build`. The Nitro preset produces a Cloudflare Worker in `.output/server` with static assets in `.output/public`. Deploy the complete Worker and assets, not the repository README. GitHub Pages cannot run the server functions in this application.

Public Supabase configuration must be provided at build time through `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`). Never put a service-role key in the frontend. `.env` stays ignored.

## Included
- Base native USDC read-only wallet discovery and balances.
- Separate TAC Points rewards screen; rolling 24-hour migration in `supabase/migrations/202610070001_rolling_24h_rewards.sql`.
- Portfolio, explorer, deposit/withdraw previews, source-market discovery, Up/Down view, reduced-motion-aware brand intro.

## Not enabled
- Real USDC prediction trading, approvals, deposits, withdrawals, position indexing and settlement: no prediction contracts or ABI are configured.
- TAC claims remain disabled until an administrator applies the rewards migration to the existing Supabase database. Client checks the migration version; the SQL function enforces cooldown using database time and a row lock.
- World market synchronization and automatic Base market creation are not implemented. External Polymarket odds are preview data only; importing a question does not deploy or resolve a Base market.

Do not represent external source volume as TacPredict volume. No fabricated prices, balances or positions. A 2x performance improvement has not been measured.

Before enabling real funds, review contracts, oracle/resolution rules, fees, slippage, permissions, allowance handling, indexer consistency, security audits and applicable regulatory requirements.

TAC promo codes: apply `202610070002_tac_promo_codes.sql` as an administrator. Admins create hashed, bounded, expiring campaigns; clients cannot list codes or grant balances. Redemption is atomic, per-account/campaign unique, with database-enforced rate limiting. USDC promo payouts and weekly/monthly activity distributions remain pending funding, verified eligibility/indexing and approved campaign rules. No campaigns or payouts have been created by this release.

Direct MCP deployment helper: `node scripts/package-cloudflare.cjs` after the build emits ignored `.output/worker-modules.json` and `.output/worker-packed.b64`. It minifies Worker modules and packages gzip static responses with `encodeBody: manual`; standard Wrangler deployments can instead use native static assets. DNS website records must be backed up before attaching the custom domain; preserve mail records.

Price charts use Coinbase Exchange closed one-minute candles plus validated public WebSocket ticker observations for BTC-USD, ETH-USD and SOL-USD. 5m/15m/1h switches filter observed spot-price windows, not prediction market durations. Start is the first observed spot value, not an oracle settlement price. Spot connection badges require a fresh timestamped ticker; stale/disconnected views fall back to SPOT. Home market countdown LIVE indicates the verified provider start/end window, not the spot connection status. Unknown source data is unavailable, never synthesized. Updates are batched at 250ms and the socket pauses in the background.

Production target: https://tacpredict.fun and www via the tacpredict-app Cloudflare Worker. GitHub source branch is development/base-usdc (PR #1); main is not automatically merged. DNS website A/CNAME content is preserved behind the Worker routes; mail DNS is unchanged.

Disconnected wallet/rewards balances display 0 as an empty state; connected RPC reads retain Loading/Unavailable until verified. Portfolio market/claim amounts show explicitly labelled preview zeros until contracts/indexing are configured.

Bundled BTC/ETH/SOL logo SVGs: spothq/cryptocurrency-icons (CC0 license included under public/brand/crypto). Logo rendering does not depend on Unicode glyphs or external image requests.

Opening: 1.8-second muted H.264 logo animation, generated from the supplied mascot with a 2.5D perspective entrance. Binary is decoded by prebuild from the committed base64 source. Intro is session-once, skippable, reduced-motion-aware, and has a 2.4-second safety timeout. No separate duplicate Connect wallet button in the disconnected portfolio.

Chart pointer/touch and keyboard inspection selects the nearest actual observation, not an interpolated quote. Up/Down opens the actual source market detail with a spot chart, source statistics, collapsible rules and quick outcome selection. Activity/OI/settlement data are not fabricated when unavailable. Streak and daily check-in share one card.

Navigation: Home / Search / Markets / Rewards / Portfolio. Search uses the current verified discovery feed plus crypto source markets, with real featured/suggested records, local query filtering and BTC/ETH/SOL aliases. Home retains crypto charts; the /up-down route remains available for existing links but is not a navigation item.

Home: large BTC spot-chart card with compact ETH/SOL outcome cards, source-provided market duration and start/end UTC window. Countdown uses verified eventStartTime/endDate (not the chart window). Unknown timing is omitted. Detail: real Polymarket CLOB outcome histories with 1H/1D/1W/1M controls, nearest observed tooltip, source statistics, related source markets, and fixed outcome choices. Missing history/activity is shown unavailable; liquidity is never called open interest. Quote percentages are not fabricated executable bid/ask cents.

Rolling crypto discovery is bounded to the provider crypto tag, excluding large unrelated auction batches that can hide current intervals. Prefer ongoing verified short intervals; upcoming records remain explicitly labelled IN rather than LIVE.

Premium UI update: removed crypto spot-window 5m/15m/1h selectors; provider duration written in full beneath asset name (e.g. 5 minutes). Detail Description has a visible preview and Show more/less, source statistics/rules/related sections and tinted safe-area outcome choices. Portfolio Deposit/Withdraw use premium action tiles and matching preview dialogs; transaction capability remains disabled.
