# Account menu, usernames & referrals

## Scope
- Header three-dot menu, keyboard-accessible mobile sheet/desktop dialog, profile, referrals, mail support/feedback, settings, Terms, logout.
- Wallet-authenticated Supabase sessions remain identity authority. D1 stores only account profile/referral metadata, not wallet USDC.
- Database: tacpredict-accounts / TAC_ACCOUNTS. Schema: database/accounts.sql. No changes to existing Supabase wallet/market tables.
- Unique case-insensitive usernames, normalized lowercase. Generated initial username. Server-enforced availability with 409 conflict and field-level error. Updates rate limited.
- Random personal referral codes; first valid browser link retained up to 30 days. Only first profile provisioning for a web3 identity created within the last 24h can bind. Existing profiles never rebind.
- Binding + one reward + reward-policy snapshot share a single SQL insert/trigger transaction. Unique invitee reward key. Self-referral blocked in application and constraints.
- Inviter earns 100 non-withdrawable VIRTUAL USDC-denominated credits by default. Invitee does not also earn a second referral reward. This is NOT Circle USDC, onchain collateral or a funded wallet balance. No transfer, redemption, withdrawal, onchain transaction or trading-credit contract integration is implemented here.
- Automatic credits up to 10 invited signups per inviter per UTC day; extras pending review. Admin can require review for all, pause future rewards or change future reward amount (0–1000). Past amounts are immutable.
- Admin Users > Referrals: paged search, account detail, username/code changes, referral suspension, pending/credit/revoke, audit reasons. Supabase assigned-admin + AAL2 RPC rechecked on EVERY admin API call. All mutations and audit record atomic. Old codes remain valid after rotation; bindings cannot be reassigned.
- Logout clears Supabase local session, disconnects Wagmi/legacy wallet and clears query caches.
- Hide overview balances preference shared with Portfolio, stored only on the current device.

## Limits / operations
- Wallet uniqueness is not proof of unique human. This does NOT guarantee multi-wallet/Sybil prevention. Review suspicious rewards before future token/cash conversion or sponsored trading.
- Credits are a private promotional ledger, not spendable in a contract. No real USDC is awarded.
- Signups with no retained link, invalid code, old auth identity or no web3 identity stay unbound. First setup decides attribution permanently.
- User referral list latest 50; admin account list 25/page; selected inviter detail latest 100 rewards; recent audit latest 25. Aggregate counts/credit totals include all records.
- Before any future cash value/redemption, do legal/security review and add stronger eligibility controls.
- D1 schema must be initialized before release; release config binds only the database ID, not credentials. It preserves existing secret bindings.
- Local node:sqlite tests use fixtures only in memory. No artificial profiles/rewards are inserted in production.
- Your Profile opens a trader-style overview: avatar/@username (You), period selector, Rank/Volume/settled P&L/Markets, Positions/Activity. Pencil opens username editing. Statistics use existing finalized Exchange reads only for a wallet verified under the signed-in account; missing/unavailable metrics remain unknown, never fabricated. Referral credits are excluded.
