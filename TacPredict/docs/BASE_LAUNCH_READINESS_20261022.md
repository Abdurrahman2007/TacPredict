# Base launch readiness and portfolio correctness

## Scope and source

Started from `development/base-usdc` at `919cf5eb1bc350bca1fbe44f5f45cd5a7cef751c` in an isolated feature branch. Existing working trees, production secrets and Draft PR #3 were not modified or imported. This release is not a claim that every feature in earlier planning documents is complete.

First-party implementation guidance:

- https://base.org/build
- https://docs.base.org/llms.txt
- https://docs.base.org/get-started/connect-to-base.md
- https://docs.base.org/specifications/reference/smart-contracts.md

Base Mainnet is 8453; Base Sepolia is 84532. The production app stays on native Base USDC, six decimals. No new token, fee prototype, AMM, deposit or withdrawal UI was added.

## Implemented

- Unknown monetary values, share counts, prices and odds are explicitly unavailable rather than fabricated zeros. Actual known zero is still displayed as zero. Positive sub-cent USDC is labelled `<$0.01` by the compact display helper. Header wallet balance formatting avoids a Number conversion.
- Selected-wallet portfolio totals use only that wallet's independently verified Base holdings. Another linked wallet's positions cannot be mixed with the connected wallet's cash. Wallet USDC is separate from position value; claimable is not added again. Last-trade marking is labelled as such, not guaranteed executable proceeds or cost-basis P&L.
- Existing RLS-scoped verified-wallet records are reused; no policy or balance writes. Account activity is explicitly labelled as spanning all verified wallets because its existing RPC does not include a per-row wallet address.
- Open orders retain their signed order tuple and expose simulated, maker-only, wallet-approved on-chain cancellation. Cancellation remains a recovery action while new-risk trading is paused. Successful receipt and indexer finality are distinguished; rejected simulation or reverted receipt cannot show success.
- Crypto / Football / Cricket classification uses actual native-market metadata; open/closed and UTC updated-date filters are real filters. Unclassified records are not guessed from titles. Unknown classifications and unavailable source data are not invented.
- Corrected native-position matching on market detail screens: the portfolio RPC returns the chain-aware `marketId`, not the database UUID. Corrected admin's created-market count from `nextMarketId` to `nextMarketId - 1` with BigInt precision.
- Reference-only Home windows are labelled PRICE WINDOW, not live prediction trading. Pool betting status respects its pause flag.
- Compact 60px brand/navigation header, accessible skip and Escape for the lightweight intro, once per browser session, no intro under reduced motion. Storage failure does not prevent the app from opening. No new image/video download is required.
- Added a fail-closed, read-only launch-readiness command and an admin explanation that deployment, DB flag and on-chain unpause are distinct from launch readiness.

## Observed Mainnet state — not a live activation

A read-only finalized snapshot at Base block **52926503**, hash `0x776f92fe36ca342304221b2072d229073f7d01ef4f0df80cfcc83dd2483fa93e` (block timestamp `2026-10-22T04:12:33Z`) was rechecked for canonicality. All six deployed runtime hashes matched the existing manifest; native collateral/decimals and guardian role matched.

The existing Registry contained one market, none open in that snapshot. Global trading remained paused. Positions native-USDC collateral was zero. Genuine executable signed liquidity, fresh finalized production indexer state, funded Mainnet buy/sell→resolution→claim/refund E2E and independent security/operational/legal review were not established by this read. Source verification is not an independent audit. An immutable 24-hour CLOB oracle challenge window cannot be compressed into an immediate test.

Cloudflare's production `tacpredict-app` settings were read without exporting secret values. The production Worker had no `UPDOWN_POOL_ADDRESS` or `POOL_REPORTER_PRIVATE_KEY` binding. Merely packaging new UpDownPool creation bytecode does not deploy or verify a pool. No pool deployment, reporter wallet, automated signing, fee change, treasury action or trading activation was performed.

## Reproduce the read-only check

From the app root:

```bash
npm ci
npm ci --prefix protocol
npm run typecheck
npm run compile --prefix protocol
node --test --test-concurrency=4 protocol/test/*.test.mjs
npm run build
# Optional dedicated RPC supplied privately through the environment; never commit its URL/key.
node protocol/scripts/check-launch-readiness.mjs --out protocol/verification/launch-readiness.json
```

The readiness command exits `2` for blocked/unknown readiness and `0` only when every required gate is proven. It only uses read methods. It never signs, spends, creates a market, edits the database or unpauses. Operational gates that it cannot read remain **unknown**, not passed. The separate pool's configuration marker is not a verification result.

## Still partial or missing

- Realized/unrealized/total P&L, average cost basis, prediction win rate and performance history require a reliable complete finalized cost-basis/outcome index. No fake analytics, zero returns or synthetic chart is substituted.
- Account-synced watchlist, unsupported profile preferences, referral payouts and new notification/email/push features were not invented. Existing verified rewards flow remains separate; this release does not claim unsupported reward mechanisms are complete.
- Native pool deployment/source/runtime verification, reviewed treasury/fee/limits, a narrowly scoped reporter, funding, role configuration, enabled series, keeper observations and funded real E2E remain separate release steps. The existing CLOB must not be unpaused just to make a parimutuel pool screen work.
- The existing protocol suite uses a local simulation. Passing it is not a funded Mainnet test, independent audit, legal approval or an operations SLA.

## Activation order

1. Choose the intended production path (existing CLOB vs separate UpDownPool); do not conflate their rules or deploy duplicate existing contracts.
2. Complete independent security/operational review and inspect a fresh finalized snapshot plus current production DB/indexer health.
3. Review exact treasury, fees, bounds, reporter permissions and funded maker/taker/operator budgets as applicable. Keep keys private and use per-action wallet confirmation; no unlimited autonomous spending.
4. Prove the genuine funded buy/sell/payout/refund path, respecting immutable timing. Do not call complete-set splitting a directional purchase.
5. Only then simulate and approve the specific activation transactions and production configuration changes. Confirm receipts, canonical finality, indexer catch-up and monitoring before describing trading as live.

## Validation record

- TypeScript `npm run typecheck`: passed on the final source changes.
- Final fast regression suite: 158 tests passed, zero failures. This includes exact display math, wallet isolation, category/date filters, cancelled/reverted receipt paths and launch-readiness fail-closed cases.
- Both local EVM suites (`protocol.test.mjs` and `updown-pool.test.mjs`) passed in the full run. That run exposed one stale UUID-based source assertion; it was corrected to the RPC's chain-aware market ID and passed in the final fast suite. No Solidity source changed.
- Protocol compilation passed. Two earlier production builds passed; a resource-constrained parallel final build was killed (137), the subsequent clean sequential final production build passed.
- Browser QA on Home and Portfolio at 320, 390 and 1280 CSS pixels: no horizontal overflow or page errors. Filters, reduced motion, skip and session-once intro behavior passed. These are disconnected-wallet previews; they do not establish authenticated Mainnet E2E or external price-provider availability.
- Changed-source lint: zero errors after formatting; existing React dependency / Fast Refresh warnings remain. Repository-wide lint is not clean at the starting commit (621 pre-existing errors); that baseline was checked separately, not attributed to this release.
