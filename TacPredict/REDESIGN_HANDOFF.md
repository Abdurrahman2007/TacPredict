# TacPredict iOS-inspired redesign — first pass

## Implemented locally

- Responsive profile with account-derived display name, available TAC balance, active/settled/all filters, active stake and potential-return totals, rewards link, refresh, privacy explanation and sign-out.
- System-font-first typography, softer surfaces, tactile navigation, safe-area viewport support and reduced-motion-aware transitions. No new animation dependency.
- Polymarket discovery merges trending and newly-created markets, deduplicates by provider ID, rejects closed/expired/unpriced markets, uses five-second fetch timeouts, and retains the last successful snapshot on failures.
- Foreground discovery refreshes every 60 seconds. This is request-driven discovery, not an always-running scheduler and not exhaustive provider synchronization.
- New/ending-soon/trending sorts use source timestamps or volume instead of string labels/IDs. Sports metadata and bounded keyword matching prevent common category mistakes.
- Provider liquidity is not represented as a predictor count.
- Removed unrelated Bitcoin charts from non-Bitcoin market details and corrected the leading-outcome label.
- Fixed the existing market-detail crash caused by a missing user binding and associated the prediction amount label with its input.

## Validation

- Production build passed.
- Changed TypeScript files passed ESLint with zero errors and warnings. This does not claim the untouched repository is lint-clean.
- Seven category regression cases passed.
- Mobile (390px) and desktop (1200px) guest-state previews and profile filter/privacy controls were checked. No real account transactions, sign-out, settlements or payouts were executed.

## Still pending

- User-supplied logo: no replacement brand asset or logo-matched opening animation has been implemented.
- World source integration: public supported data access and applicable terms still need verification. No World data scraper or copying agent was deployed.
- An always-on ingestion/scheduling service, approved category creation, persistence, moderation and settlement monitoring. These require a chosen backend host and deployment access. New categories/market types must not become tradable without validated rules and resolution handling.
- GitHub push/PR: this work is local on development/ios-redesign, based on main commit 8556d27. Main was not modified. No production deployment happened.
- No claimed 2x performance speedup: comparative device/network benchmarks have not been run.
- No requested model switch: the available-model tool returned no selectable models.

## Apply the patch

Apply the accompanying patch from the repository root (the parent of the TacPredict folder) to a branch based on commit 8556d27:

```sh
git switch -c development/ios-redesign
git apply --check TacPredict-ios-redesign.patch
git apply TacPredict-ios-redesign.patch
cd TacPredict
npm ci
cp .env.example .env
# Configure the existing Supabase environment locally; never commit credentials.
npm run build
```

Alternatively the accompanying ZIP contains the complete working source under TacPredict/. Set the deployment project root to TacPredict, not the outer repository root. Neither artifact includes .env, node_modules, .git or build output. Keep all service credentials server-side.
