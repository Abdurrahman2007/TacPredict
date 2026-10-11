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

## Final production follow-up
- Price-only CoinGecko snapshot no longer waits for three history fetches. Spot path performs one upstream price request; homepage separately requests only BTC history (two cold provider calls rather than four). ETH/SOL history is loaded on relevant detail views. History has a separate 10-minute cache and in-flight deduplication.
- Added isolated price-loading test: spot snapshot performs exactly one request, history fetch is cached, unsupported asset is rejected. This is not a claim of a measured 2× full-page speedup.
- All 30 existing/full local regressions passed, including 16 isolated contract scenarios; the new price-loading test also passed separately. TypeScript and final production build pass.
- Latest Worker upload: 2026-10-11T14:02:04Z, 108 modules. Final production check: three original previews, crypto price and BTC history available, Google/X enabled, no JS errors/overflow, Markets heading before previews.
- Fifteen additional production page/viewport checks (320/375/1200) passed; unauthenticated manual discovery endpoint returned HTTP 401.
- Logs confirmed the one-minute finalized indexer still succeeds, but it is catching up, not fully synchronized. Sample: finalized 52468406, through 52464567 (3839-block lag). Do not treat indexed figures as current chain-head figures until caught up.
- The 15-minute discovery schedule is configured and the Workers AI binding/model is present. The first scheduled discovery execution was NOT observed in the verification window; cron propagation and actual AI/DB completion remain to be checked. Seeded previews/candidates are actual metadata/observations, not proof of an automatic run.
- Temporary deployment KV namespaces deleted; log sampling restored to 0.1; all existing secret bindings retained. No role, balance, contract deployment, approval, unpause or transfer performed in this release.

## World-style navigation and prediction UI follow-up
- Latest user instruction supersedes earlier five-item navigation: Home, Search, Markets, Portfolio only; Rewards is reachable from the subtly animated header icon on mobile AND desktop. Rewards route/task verification remains intact.
- Rounded World-inspired market cards: category/date, outcome rows, thin probability bars, implied-multiple label (not an executable quote), probability pills, OI/volume footer. Unknown financial values remain em dashes; unknown probabilities do not draw fake bars or show a 0% chart legend.
- Original BTC/ETH/SOL previews now open real /markets/preview-* detail routes. Full asset reference charts, proposed rules/source, unknown prediction statistics, and two outcome buttons fixed above (not over) the four-item mobile nav. Preview IDs are not contract market IDs.
- Mobile outcome selection opens a compact centered amount preview; desktop shows an amount sidebar. Yes/No selection and 5/10/25/50 USDC presets work. Confirm is disabled, with no signer/order/transaction path in preview UI. No fabricated wallet balance, share price, payout, volume, or liquidity.
- Homepage has one own-crypto prediction card per asset, not duplicated questions. BTC large reference chart + Yes/No buttons; ETH/SOL compact outcome rows. Without any actual Up/Down native market the section is accurately titled Crypto Predictions, not fake live five-minute markets.
- Removed redundant empty native section/long freshness text from homepage while retaining concise pre-launch status and relevant attribution.
- Three new non-financial UI regression tests pass; TypeScript and production build pass. The earlier full protocol regression results are historical and were not rerun for this CSS/UI-only follow-up.
- Database-backed local 320/375/1200 checks passed: four nav items, header Rewards, functioning amount preset (25), disabled confirmation, no page/dialog overflow or JS errors, and outcome dock/nav adjacent with no overlap.
- Runtime deployed 2026-10-11T14:20:23.960592Z (108 modules). Temporary staging namespaces deleted. Existing secret bindings/AI binding and minute indexer + 15-minute discovery schedules retained.
- Financial state unchanged: Base mainnet only, six contracts remain paused, no native market/liquidity/real-USDC E2E added. First automatic AI/discovery run still not observed in sampled telemetry; configuration is not proof of successful execution.
- Final live 320/375/1200 verification passed after the final upload: exactly three distinct own-crypto homepage cards, four navigation links, header reward icon visible at all widths, functioning 25-USDC amount preset, disabled trading, centered popup without horizontal scroll, no overlap with bottom nav, and no JavaScript errors.
