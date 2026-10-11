# TacPredict UI and draft discovery release

Base Mainnet 8453 and native USDC only. Contracts remain paused. No money moved and no on-chain market was published.

## Implemented
- Unified centered authentication dialog, lazy-loaded auth panel, actual provider readiness (disabled social methods hidden), no dummy ellipsis provider. Signed-in accounts can connect Coinbase/injected wallets without replacing their Supabase identity; private positions still require wallet proof.
- Google/email/X readiness confirmed against real Supabase settings; Google and X authorize endpoints return real provider redirects. Local real-settings UI shows both buttons. Wallet app deep links for MetaMask/Trust and detected installed providers are included under All wallets; no fabricated QR/provider count.
- Rewards condensed to four compact verified steps; detailed reward terms collapsed. Signed-out portfolio initial display is 0.00 as requested, explicitly not a fetched authenticated balance; authenticated unavailable values remain unknown. Duplicate portfolio Connect Wallet removed; header account offers real wallet connection.
- White Login, small animated Rewards header control, actual artwork pixel assembly intro, reduced-motion support, shorter once-session intro.
- Cleaner portfolio: real Base wallet balance, finalized position value and claimable sums, conceal/copy/refresh, Positions/Open/History and position search. No fabricated P&L history. Funding buttons remain disabled.
- Main Supabase migration 0017: private candidate queue/policy/run history, public original pre-launch previews only, service-only discovery lease and persistence, MFA+admin policy and review RPCs, audit logging. Rollback smoke denied anonymous private access and unauthenticated MFA access; actual migration applied.
- Bounded Polymarket Gamma metadata discovery: 20 records/page, rotating offset capped at 200, exact normalized-question/outcome/deadline fingerprint + unique source ID. Semantic similarity beyond normalization remains pending. External prices, volume, foreign token and condition IDs deliberately not imported.
- Three original BTC/ETH/SOL preview questions seeded from fresh real CoinGecko observations. Clearly labeled pre-launch, not live or tradeable, no on-chain ID or invented YES/NO probability/volume.
- Separate 15-minute discovery cron; existing one-minute finalized indexer unchanged. Cloudflare Workers AI Llama 3.1 8B FP8 performs one bounded metadata clarity review per cycle when an eligible candidate exists; advice cannot override policy or authorize contracts.
- /admin/market-importer with role+MFA, real queue/run/counts, pause/resume, review/reject, authenticated manual retry. Auto-publish enforced OFF in DB and no signer in agent.
- Provider attribution removed from unrelated finance pages, retained quietly on relevant market pages.

## Validation
- TypeScript passes; production build passes.
- 14 targeted tests passed (importer, admin, RPC budgets/config, oracle observer).
- Local mobile 375×900 auth and portfolio: no overflow or page errors; auth bounding box x16 y166 width343 height568 (centered).
- Baseline production one sample: DOMContentLoaded 2492ms / 42 resources. Not proof of a 2× gain; performance ratio not claimed.

## Not implemented / not claimed
- Auto-publish, automated signed oracle resolution, unrestricted autonomous financial actions.
- Funded native market, maker liquidity, real-USDC full buy→resolve→claim E2E, independent audit or public trading launch.
- Full semantic duplicate classifier, legal/rights approval, all category-specific providers and resolution adapters.
- User-provider sign-in completion/OTP delivery end-to-end and admin MFA manual retry have not been user-tested in this release.
- TwinMind current browser session was signed out; no new TwinMind output is claimed. Existing earlier design review remains historical. Worker model is not Opus/Astra.
