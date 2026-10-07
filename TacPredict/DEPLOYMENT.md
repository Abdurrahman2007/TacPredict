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
