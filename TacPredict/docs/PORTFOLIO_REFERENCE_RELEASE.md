# Portfolio-only reference release

Design source: owner-supplied `tacpredict-portfolio-empty.html`. Only its portfolio styling/layout is used.
No remote scripts, analytics beacon, fake example positions/history/P&L, branding/header/nav, or fee-rebate promise was imported.

## Changes
- Compact blue/dark reference balance, Deposit/Withdraw, performance card and Positions/Open/History.
- Owner requested no balance hiding: eye/hide control removed.
- Empty/signed-out account shows $0.00. Real zero wallet balance shows $0.00; failed/unloaded real balances remain unavailable, not falsified.
- Total displayed is self-custodial wallet USDC + marked Base positions only when both are known. No double-counting claimable winnings.
- Supabase existing private portfolio/activity RPCs retained; wallet ownership proof and actual on-chain claim retained.
- Open now means actual pending signed orders, not open positions.
  Authenticated-session query explicitly filters user_id and Base8453, under existing Own signed orders RLS.
  Query reads only OPEN/PARTIAL, future expirations, remaining shares >0, limit250. Filled amount cast to text; exact BigInt math.
- Value/shares/date sort, search, active-only filter; unknown values sort last.
- Sharing copies/shares only the generic portfolio URL, never balances/wallet details.
- Funding actions use existing simulated, wallet-confirmed native Base USDC transfer flow. No automatic fund movement, new vault, contract changes or unpause.
- No cost-basis/performance history backend currently exists. Empty history displays0; existing account performance stays unavailable rather than synthetic.
  Period controls select labels; no fabricated time series is plotted.

## Verification
11 focused portfolio/auth/import tests pass; TypeScript + production build pass.
Local 320/375/462/1200px: no overflow; tabs, period and active-only control work; Deposit opens actual login.
Anonymous private-order read denied HTTP401. Real signed-in order/withdraw/claim end-to-end requires owner session/wallet; not performed.
No other page or shared header/navigation modified. Admin QR repair from previous source commit remains intact.

## Owner compact/theme follow-up
- Portfolio background is transparent and inherits site colors; no isolated black rounded page panel.
- Card/secondary/border/primary use the TacPredict theme. Card whitespace/chart height reduced.
- Removed paused-trading badge from balance summary; it does not restrict reading zero wallet balances.
- Empty-state zero baseline is clearly empty performance, not a fabricated asset-price history.
- Portfolio CSS registered via route stylesheet URL.
- Live QA identified native-select reparenting: React expected SELECT under tp-filters, but it was nested in a replacement DIV, causing removeChild/418 hydration failures on tab changes.
  Replaced the native select with a custom Popover listbox; no authentication/permission bypass.
- Financial trading, rewards, contract ownership and navigation unchanged.

## Interactive chart and one-time motion
- Read-only SVG P/L chart with pointer/touch and keyboard scrubbing. No signing/USDC transaction calls.
- Empty portfolio renders a flat $0.00 baseline with No trades tooltip. Unknown historical performance stays unavailable; no synthetic price curve.
- Period buttons enlarged to12px mobile /13px desktop; selected period has a short chart transition.
- Route entrance is380ms opacity/8px translate on mount only. Data/query refreshes never re-key or restart the entrance.
- Reduced-motion preferences disable entrance/range animation and cursor transitions.
- Live320/375/1200px checks: no overflow, tooltip/keyboard, range selection work; refresh does not restart entrance; Home->Portfolio entry works; reduced motion respected; zero JS errors.
- TypeScript and production build pass. Backend financial behavior unchanged; existing full P/L history requires cost-basis indexing, not fabricated in UI.
