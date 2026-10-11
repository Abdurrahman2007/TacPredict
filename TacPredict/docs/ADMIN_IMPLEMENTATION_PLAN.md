# Base Mainnet admin expansion — implementation plan, not completion evidence

The public Home/Search/Markets/Rewards/Portfolio navigation remains unchanged. `/admin` already checks a main-Supabase assigned admin and provides locked-metadata preparation plus wallet-simulated/signed Factory and Oracle operator actions. This document records the new requested A–Z scope; it does not assert the following features exist yet.

## Security invariants
- No hardcoded/shared password, URL password unlock, browser-only role flag or API credential in the frontend. A password disclosed in chat must be replaced through a secure flow; never commit it.
- Existing Supabase authentication + server-verified session + database-assigned role; add TOTP AAL2 with server AND RPC/RLS enforcement. Browser AAL indicators are not authorization. Check real claims; MFA enrollment must not grant an admin role.
- Distinct Super Admin, Market Manager, Resolver and Support permissions need a reviewed migration, guarded assignment and append-only audit; do not silently treat all four as equivalent or grant new users privileges.
- On-chain admin roles and app roles are separate. Wallet connection alone is not ownership/authentication. Contract roles, simulation and explicit wallet confirmation govern financial actions. App MFA cannot retroactively enforce MFA on direct calls to existing contracts.
- Critical financial state is indexed finalized Base Mainnet (8453) truth. Atomic USDC amounts are exact decimal strings/BigInt, six decimals. API failures are unavailable, not zero. USDC is the existing native Base token, not a newly deployed asset.
- Never edit user balances/positions/shares, fake health indicators, prices, liquidity, fees, profits or demo trades. CLOB liquidity is backed complete sets and live orders, not a fabricated AMM pool.
- Published hashes/rules/source/outcomes/time limits remain immutable. Contract challenge, dispute and timeout rules must not be bypassed. New UI settings do not change immutable deployed contracts.

## Incremental acceptance gates
1. **Admin shell + security**: isolated premium responsive navigation; actual sign-in/account/role/MFA states; session revocation and audit semantics documented; unauthorized and non-AAL2 server/DB access tests. Preserve public navigation.
2. **Read-only operational dashboard**: exact counts and 24h/7d finalized trade totals, checkpoint age/block, real scheduled run outcome, verified deployment/source details; monitored RPC/provider statuses only when actually probed; unavailable for unsupported/unmeasured metrics.
3. **Markets**: separate draft metadata from on-chain markets; filtering/search/pagination; cover/tags/category, timing and immutable-rule validation; actual preview, wallet-approved create, receipt/finality and traceable IDs. No frontend-only publication or fabricated marketId.
4. **Trading / financial investigation**: read-only orders/trades/positions/transactions, exact shares/USDC/fees where derivable, chain filters and BaseScan links; no balance edits. Do not expose private signatures/auth data to support users.
5. **Resolution**: source-bound evidence, proposals/disputes/challenge windows/finalization/timeout; actual contract-state preconditions and role checks; settlement/claims/refunds truth and proof links. Unsigned observer tooling is not an autonomous signer.
6. **Users/support/risk**: privacy-scoped user/wallet investigation, policy-defined flags and audit; risk flags do not magically freeze permissionless funds; no untested abuse-scoring claims.
7. **Settings and management**: guarded admin roles, categories, sources/providers, featured ranking, search/notifications/maintenance; distinguish off-chain settings from on-chain contract configuration. Treasury withdrawal only if supported and explicitly authorized, not an invented endpoint.
8. **Analytics / release**: clearly defined sourced DAU/WAU/MAU, volume/category/inflow/outflow series; measured freshness, monitoring, pagination, exports with privacy/CSV-injection protection; independent security review and real funded Mainnet E2E before launch.

## Actual current launch constraints
Six contracts publicly source-verified, not independently audited; trading paused. The finalized indexer backlog was caught up to block 52457059 and independent one-minute automatic SUCCESS observed. No native market, funded CLOB liquidity, native USDC collateral or full real buy/sell→resolve→claim E2E yet. Oracle has an immutable 5 USDC bond and 24-hour challenge. New admin role/MFA/dashboard/modules above are planned, not presently completed.

## TwinMind assistance
A sanitized, memory-context-disabled code/review request was sent through the authenticated MAX account using the visible Claude Opus 5.5 Thinking option. It returned “Failed to generate a response”; no code from that request has been accepted. A smaller independent request was sent using the visible GPT-6 Astra Thinking option. Record an actual response, review it, adapt it to this repository and test it before claiming TwinMind-generated implementation or deployment. No secrets, real user records or signing material were included.

## First workspace phase — implemented 2026-10-11

TwinMind's visible GPT-6 Astra Thinking option returned illustrative formatter, shell and SQL authorization code. The example targeted Next.js and included automatic-link formatting artifacts; it was reviewed and adapted to this project's TanStack Start, existing main-Supabase tables and existing assigned admin role, not copied as a fake new database. Code provenance is assistance, not an independent security audit or a claim of the provider's underlying model identity. Opus's separate request failed; no successful Opus review is claimed.

Implemented: responsive 10-section admin shell; real read-only native-market/prepared-term, finalized-trade, resolution, account/wallet-count, deployment/checkpoint, 24h/7d-volume and audit views; truthful unavailable treasury/settings capabilities; existing wallet-signed operator console retained. AAL2 is now checked in new server reads, metadata preparation and deployment access, and explicitly in the database snapshot/preparation RPCs. TOTP enrollment/challenge verification uses Supabase MFA. No shared password or new role grants were installed. Password/username admin-login mode, the separate `/admin/login` path, four-role management and complete investigations/workflows remain pending.

Validation: production build passed; full TypeScript no-emit check passed; three new local tests passed for exact BigInt formatting, snapshot validation and authorization invariants. The migration was first exercised and rolled back: anonymous and existing-admin AAL1 denied, existing-admin AAL2 read shapes validated for all ten sections. The tested migration was then applied to the MAIN Supabase project. This database-owner test does not substitute for a real administrator signing in, enrolling TOTP, testing session revocation and completing on-chain actions.

Deployed to the existing production Worker at 08:21 UTC, preserving the one-minute indexer schedule and existing server-only credentials. Temporary release staging was deleted. Public trading remains paused; full A–Z completion is NOT claimed.

Live anonymous checks: all 12 width/route combinations (320/375/1200 × /admin, /, /rewards, /profile) returned 200, no page errors, no document-width overflow and all five public navigation labels. The new admin RPC returned HTTP 401 to the actual anonymous publishable-key request. A real administrator TOTP enrollment/session-revocation and wallet-action E2E remain untested, not completed.

Full protocol regression after admin integration: 26 top-level tests, 26 passed, 0 failed (including the isolated contract scenarios). After the new admin deployment, the real scheduled indexer continued SUCCESS at 08:22/08:23/08:24 UTC and checkpoint 52457637. No production trading was activated.
