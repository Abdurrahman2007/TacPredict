# TacPredict production connection

Project: `lmqaiqvwcytmgwgwyfwx`; app: `https://tacpredict.fun` (and www).

## Configured and verified
- User-owned Supabase replaces Lovable Cloud; old backend/data is not deleted or migrated.
- Production Site URL and exact root/auth/callback allowlists.
- Email OTP configuration: six digits, 600 seconds (backend enforced).
- Ethereum Web3 auth enabled. Native signed-message sign-in tested.
- Account baseline and rolling TAC/promotional-code migrations applied to the fresh database.
- Private-row reads, no client balance/role/event writes; new users have zero TAC.
- Wallet auth is separate from read-only Connect wallet and never requests a transaction/approval.
- CoinGecko key is a server-only Worker secret, never a VITE variable or public source value.
- Prices/history use CoinGecko actual samples, cached client-side, server-side and at the edge. Short-window reference samples are not settlement-oracle prices.

## Awaiting dashboard access / credentials
- `202610080003_locked_usdc_rewards.sql` is prepared; application must verify successful execution before claiming task backend ready.
- Enable Supabase manual identity linking for the user's explicit Connect X feature.
- Google OAuth: public Supabase settings now report enabled; the app reads availability dynamically. User-account end-to-end sign-in remains to be validated.
- X OAuth 2.0: native Supabase client/linkIdentity ready, but public settings still report `twitter: false`. The app will automatically enable the button when Supabase reports it enabled.
- Email provider is enabled and the app email-code form is active. Custom SMTP/template delivery is not confirmed through public settings. The template must include `{{ .Token }}`; real six-digit code delivery/verification still needs a user-approved test.
- Google/X OAuth callback at their provider console: `https://lmqaiqvwcytmgwgwyfwx.supabase.co/auth/v1/callback`.
- Provider buttons now read the public `/auth/v1/settings` endpoint. Environment readiness flags are only an offline fallback; enabled status does not prove full OAuth or email delivery.

## Rewards and funds
- Welcome campaign advertises a **15 USDC locked reward offer**. An offer is not a wallet deposit or already-earned balance.
- Qualification requires verified Supabase account, linked X identity, at least 5 USDC verified contract deposits, and four USDC-funded prediction events.
- Only a future trusted indexer writes USDC proofs. It must validate finality, receipt logs, supported native USDC, configured audited contract and account ownership. No writer is configured today.
- Once qualified, an idempotent ledger records the locked promotional credit. It remains non-withdrawable and non-spendable; there is no withdrawal RPC or credit-to-wallet transfer.
- All prediction amount previews are USDC-only. Actual trading/deposits/withdrawals remain disabled pending audited contracts, funded execution and indexer deployment.
- Never present a Connect wallet click, wallet token balance, client task flag or self-reported transaction as a verified deposit/prediction.
- Farcaster QR/custody flow is implemented; relay/domain/nonce verified. Full user-approved Farcaster sign-in still needs end-to-end testing. Supabase authenticates the signed custody wallet; FID/profile fields never grant server roles.
- Rate limiting exists on native Web3 auth; CAPTCHA/abuse controls should be reviewed before opening any funded campaign.
