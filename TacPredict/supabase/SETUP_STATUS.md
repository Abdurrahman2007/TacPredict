# TacPredict production connection

Project: `lmqaiqvwcytmgwgwyfwx`; app: `https://tacpredict.fun` (and www).

## Configured and verified
- User-owned Supabase replaces Lovable Cloud; old backend/data is not deleted or migrated.
- Production Site URL and exact root/auth/callback allowlists.
- Email OTP configuration: six digits, 600 seconds (backend enforced).
- Ethereum Web3 auth enabled. Native signed-message sign-in tested.
- Account baseline and rolling TAC/promotional-code migrations applied to the fresh database.
- Private-row reads, no client balance/role/event writes; new users have zero TAC.
- Coinbase Wallet uses the official SDK with EOA-only signing (native Supabase does not claim unsupported smart-wallet/1271 signatures). Farcaster uses its official Auth client and custody-wallet proof, then independent Supabase signature verification. No transaction/token approval. Read-only balance sync follows successful Coinbase wallet auth.
- The login header displays actual session identity or connected Base USDC balance; no promotional credit is shown as spendable funds.
- Intro is a native-resolution, perspective/extrusion 3D CSS logo scene; no low-resolution video is loaded. Reduced motion and session-once behavior are respected.
- CoinGecko key is a server-only Worker secret, never a VITE variable or public source value.
- Prices/history use CoinGecko actual samples, cached client-side, server-side and at the edge. Short-window reference samples are not settlement-oracle prices.

## Awaiting dashboard access / credentials
- `202610080003_locked_usdc_rewards.sql` is prepared; application must verify successful execution before claiming task backend ready.
- Enable Supabase manual identity linking for the user's explicit Connect X feature.
- Google OAuth: public Supabase settings now report enabled; the app reads availability dynamically. User-account end-to-end sign-in remains to be validated.
- X OAuth 2.0 is enabled: `provider=x` authorize route returns a real redirect to x.com. The legacy public settings `twitter:false` does not describe the new `x` provider. Login, explicit identity linking, and reward verification now use/recognize the modern provider.
- Resend sender domain tacpredict.fun verified; sending-only domain-scoped key connected to hosted custom SMTP (smtp.resend.com:465, username resend). Sender TacPredict <support@tacpredict.fun>. Existing Cloudflare MX/routing/SPF preserved; only the Resend DKIM TXT and DNS-only return-path CNAMEs were added.
- Both Magic link/OTP and Confirm signup hosted templates are branded and code-only (`{{ .Token }}`, no ConfirmationURL). Six digits / 600-second expiry verified in dashboard. Real recipient delivery and complete OTP sign-in still require a user-approved test.
- Resend Free sending limits are 100/day and 3,000/month. Setup/testing only, not a guarantee of production capacity for 75,000 users. No paid plans were activated.
- Google/X OAuth callback at their provider console: `https://lmqaiqvwcytmgwgwyfwx.supabase.co/auth/v1/callback`.
- Provider availability uses cached public settings plus a non-followed modern-X authorize probe. Enabled status does not prove full OAuth or email delivery.

## Rewards and funds
- Welcome campaign advertises a **15 USDC locked reward offer**. An offer is not a wallet deposit or already-earned balance.
- Qualification requires verified Supabase account, linked X identity, at least 5 USDC verified contract deposits, and four USDC-funded prediction events.
- Only a future trusted indexer writes USDC proofs. It must validate finality, receipt logs, supported native USDC, configured audited contract and account ownership. No writer is configured today.
- Once qualified, an idempotent ledger records the locked promotional credit. It remains non-withdrawable and non-spendable; there is no withdrawal RPC or credit-to-wallet transfer.
- All prediction amount previews are USDC-only. Actual trading/deposits/withdrawals remain disabled pending audited contracts, funded execution and indexer deployment.
- Never present a Connect wallet click, wallet token balance, client task flag or self-reported transaction as a verified deposit/prediction.
- Farcaster QR/custody flow is implemented; relay/domain/nonce verified. Full user-approved Farcaster sign-in still needs end-to-end testing. Supabase authenticates the signed custody wallet; FID/profile fields never grant server roles.
- Rate limiting exists on native Web3 auth; CAPTCHA/abuse controls should be reviewed before opening any funded campaign.
