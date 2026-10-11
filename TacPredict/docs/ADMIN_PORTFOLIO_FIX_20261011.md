# Admin MFA repair and portfolio refresh — 2026-10-11

## Deployed
- Supabase auth-js v2 returns TOTP QR as `data:image/svg+xml;utf-8,<svg...>`.
  The previous UI wrapped/encoded that complete URI as SVG again, causing broken images.
- `authenticatorQrSource` normalizes raw SVG, SDK data URI, encoded SVG or base64 SVG.
- QR rendering failure offers a private, explicitly revealed manual setup key.
  The key is component memory only, never logged/persisted/sent to another provider; it is cleared after verification.
- Six-digit code comes from a TOTP authenticator, not email. Assigned role/AAL2 checks remain enforced.
- No admin password shortcut or MFA bypass was added. Existing verified factors are not reset.
- Portfolio has balance summary, self-custodial Base-USDC Deposit/Withdraw flows,
  Profit/Loss period selection (1D/1W/1M/1Y/YTD/ALL), Positions/Open/History and search.
  Removed event/reward cross-sell cards and reduced explanatory text.
- Unknown signed-in balances/P&L remain unavailable; signed-out initial zero isn't a fetched wallet balance.
  No fabricated performance history/graph. Trading label uses deployment state.

## Tests
8 focused parser/importer/MFA QR unit tests pass; TypeScript check and production build pass.
No real account's TOTP was generated or consumed in automated QA. Owner verification is still needed.
Actual financial Deposit/Withdraw E2E requires owner wallet and funds; no funds were sent in this release.
