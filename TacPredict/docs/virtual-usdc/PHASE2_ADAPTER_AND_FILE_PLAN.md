# Phase 2 — UI adapter feasibility and exact proposed implementation files

**Review only. Every source/test/SQL path below is PROPOSED, NOT IMPLEMENTED.** Only Phase 2 Markdown/JSON design documents are added now. Original UI, contracts and configuration remain unchanged.

## 1. Adapter feasibility — source findings [SV]

| Existing path (relative to TacPredict/) | Finding | Proposed minimal integration |
|---|---|---|
| `src/domain/markets/types.ts` | Market has real `native?: NativeMarket`; not a virtual protocol discriminant | Add explicit virtual trading descriptor; do not spoof `native` or overwrite real fields |
| `src/components/prediction-amount-card.tsx` | Imports placeLimitBuy/placeLimitSell/fillOffer, native orderbook/feed and wallet.usdc; real-USDC, limit-order and exchange approval copy | Dispatch at the boundary to a virtual renderer using the same layout/slots; preserve old path untouched |
| `src/components/prediction-detail.tsx` | Native portfolio/status/market ID assumptions are embedded | Dispatch typed stats/positions/resolution by protocol; unchanged outer prediction layout |
| `src/routes/markets.$marketId.tsx` | Native loader + NativeMakerTools/NativePublicResolution/terms/activity | Explicit virtual loader/detail branch, never real maker tools on virtual market |
| `src/routes/up-down_.$asset.tsx` | Real feed and existing duration model | Virtual-series adapter branch, no default-to-real when unavailable |
| `src/components/updown/updown-detail.tsx` | Native feed and PoolTradeBar/UpDownTradeBar dispatch | Explicit virtual branch, no Pool path for virtual trades |
| `src/components/updown/trade-bar.tsx` | Shared amount card modal and real trade/approval wording | Virtual semantic copy; same dock/modal geometry |
| `src/routes/profile.tsx` | Uses NativePortfolio and useNativePortfolio | Explicit virtual portfolio tab/view namespace, no overwriting wallet.usdc |
| `src/lib/protocol/admin-nav.ts` | Existing admin section allowlist | Add distinctly labeled virtual section and views |
| `src/components/admin/admin-section-view.tsx` | Existing admin view dispatcher | Add virtual dispatcher; do not replace existing real admin operations |

**Answer:** visually unchanged prediction UI is feasible **through a typed adapter plus minimal presentation-binding changes**, not a backend-only substitution. Preserve CSS, card/modal/chart structure, responsive behavior, outcome buttons, amount controls and existing header/navigation. No redesign requested or proposed.

Required wording/behavior exceptions for approval:
- “Wallet USDC” -> “Virtual USDC”; clear nontransferable/nonwithdrawable/no-redemption disclosure.
- Real signed limit order / ERC1155 exchange approval -> AMM quote, minimum received and distinct transaction confirmation.
- Existing limit price can become an average execution price bound; it must not imply an unfilled resting order exists. Alternatively hide that field in virtual mode.
- “Executable sell offers” -> AMM executable depth/quote, not fictitious maker orders.
- Pending / included-provisional / finalized; no API-only success. Error/stale balances never masquerade as actual zeros.

Reference spot charts and design components can stay unchanged: `src/components/mobile-outcome-dock.tsx`, `src/components/crypto-detail-chart.tsx`, `src/components/updown/coingecko-chart.tsx`, shared market-card styles, logos, header/navigation. If implementation reveals a new necessary visual/source change, stop and update this plan rather than quietly expanding scope.

## 2. Proposed new files, exact paths

All paths below are relative to `TacPredict/`. These are the initial implementation allowlist **after approval**, not a claim they exist. Generated artifacts/locks enter review only after reproducible generation; no deployment address/config is invented.

### Separate virtual protocol and local tests

```
protocol/virtual/package.json
protocol/virtual/package-lock.json
protocol/virtual/foundry.toml
protocol/virtual/contracts/VirtualMarketRegistry.sol
protocol/virtual/contracts/VirtualTradingEngine.sol
protocol/virtual/contracts/VirtualResolution.sol
protocol/virtual/contracts/interfaces/IVirtualMarketRegistry.sol
protocol/virtual/contracts/interfaces/IVirtualResolution.sol
protocol/virtual/contracts/libraries/VirtualFpmmMath.sol
protocol/virtual/scripts/compile.mjs
protocol/virtual/scripts/prepare-testnet-plan.mjs
protocol/virtual/test/VirtualTradingEngine.t.sol
protocol/virtual/test/VirtualFpmmInvariant.t.sol
protocol/virtual/test/VirtualResolution.t.sol
protocol/virtual/test/TransactionIsolation.t.sol
protocol/virtual/test/VirtualAccessControl.t.sol
protocol/virtual/test/VirtualNumerics.test.mjs
```

Existing protocol uses solc 0.8.30/OZ 5.2.0 and Ganache 7.9.2 with Shanghai compilation [SV]. Keep old toolchain/old six artifacts unchanged. New build must explicitly target compatible EIP-1153 execution and pin its own dependencies. Proposed Foundry/Anvil Cancun harness is a tool requirement, **not verified installed or tested here**; verify availability/version/security before use. `prepare-testnet-plan` only prepares an unsigned, chain-allowlisted deployment plan; it must not auto-send transactions. Deployment scripts/real manifest require later explicit authorization, not bundled permission from implementation approval.

### Virtual app adapter and service layer

```
src/lib/virtual/types.ts
src/lib/virtual/abi.ts
src/lib/virtual/config.ts
src/lib/virtual/market-adapter.ts
src/lib/virtual/series.ts
src/lib/virtual/quote.ts
src/lib/virtual/accounting.ts
src/lib/virtual/execution.ts
src/lib/virtual/receipts.ts
src/lib/virtual/portfolio.ts
src/lib/virtual/read.functions.ts
src/lib/virtual/read.server.ts
src/lib/virtual/trade.functions.ts
src/lib/virtual/trade.server.ts
src/lib/virtual/eligibility.server.ts
src/lib/virtual/indexer.server.ts
src/lib/virtual/reconciliation.server.ts
src/lib/virtual/points.ts
src/lib/virtual/points.server.ts
src/lib/virtual/sponsorship.server.ts
src/lib/virtual/admin.functions.ts
src/lib/virtual/admin.server.ts
src/components/virtual/virtual-amount-card.tsx
src/components/virtual/virtual-market-detail.tsx
src/components/virtual/virtual-portfolio.tsx
src/components/admin/views/virtual.tsx
supabase/migration-drafts/virtual-v1.sql
```

`config.ts` contains disabled-by-default public types/validation, not a live address or production env change. Route networking can use existing TanStack server functions; `/api/virtual/v1` is the logical API contract in the interface document, not a requirement to add dozens of routes or a new backend framework. BigInt math in the browser/server is a simulation/display mirror; only the engine executes accounting.

The migration is a **non-auto-applied draft outside `supabase/migrations/`**. No production migration or D1 rewrite. Service/sponsor code is inert unless a separately approved deployment/config supplies actual verified addresses/capabilities. No private key generation, use or secret changes during implementation approval alone.

### New application/integration tests

```
protocol/virtual/test/receipt-indexer.test.mjs
protocol/virtual/test/points-snapshots.test.mjs
protocol/virtual/test/sponsorship.test.mjs
protocol/virtual/test/ui-adapter.test.mjs
protocol/virtual/test/virtual-rls.test.mjs
protocol/virtual/test/admin-permissions.test.mjs
protocol/virtual/test/virtual-e2e.spec.ts
```

E2E uses local contracts and fixture-auth identities, never real production keys. RLS tests require a disposable local Supabase instance; if unavailable report NOT RUN, not PASS. UI screenshot comparisons cover the same viewports and prohibit unapproved visual redesign. New test harness setup must not rewrite existing test scripts or implicitly start production indexers.

## 3. Proposed modifications to existing files (only after approval)

```
src/domain/markets/types.ts
src/components/prediction-amount-card.tsx
src/components/prediction-detail.tsx
src/routes/markets.$marketId.tsx
src/routes/up-down_.$asset.tsx
src/components/updown/updown-detail.tsx
src/components/updown/trade-bar.tsx
src/routes/profile.tsx
src/lib/protocol/admin-nav.ts
src/components/admin/admin-section-view.tsx
```

Purpose limited to protocol discrimination, virtual data/transaction hooks, semantic copy and virtual admin dispatch. No source file in this list is changed in Phase 2. Reuse existing wallet proof and admin gate APIs; do not weaken authentication or edit them simply to simplify integration. No scheduled worker/package-cloudflare/production settings change is currently authorized; an unsigned future operator runbook may describe virtual indexer scheduling later.

## 4. Explicit denylist / preserved boundaries

- All six `protocol/contracts/{MarketRegistry,MarketFactory,ConditionalPositions,Exchange,ResolutionOracle,Settlement}.sol`, their deployment manifest/addresses and compiler/artifacts.
- `protocol/contracts/UpDownPool.sol` and its real-USDC execution path.
- `src/lib/protocol/execution.ts`, real portfolio/order/collateral/ranking helpers, `src/lib/pool/pool-client.ts`.
- Existing production migrations, `database/accounts.sql` referral accounting, existing USDC balance and allowance fields, existing worker schedules.
- Production workflow/configuration, env/secrets, treasury, mainnet/testnet transactions, deployment activation.

No running code interprets a virtual market as `native`. New React Query keys start with `virtual` and include chain/engine/version/wallet/block context; old real protocol keys remain intact. Unknown virtual deployment or stale projection produces an unavailable trade action, never a real-money fallback.

## 5. Delivery sequence after approval / rollback

1. Local protocol/math tests, no UI integration yet; independent architecture delta review if design changes.
2. Local database draft and indexer/receipt tests; service remains disabled.
3. Virtual adapter using fixture/local-chain data, screenshot and semantic review; existing real path regressions checked.
4. Local admin/points/sponsor simulation and adversarial E2E; produce test results and unsigned testnet plan.
5. Stop for separate testnet approval. Later stop again for independent security review and explicit production approval.

Current Phase 2 rollback: revert the documentation-only commit; no runtime rollback needed. Future pre-deployment implementation rollback: revert allowlisted source changes, delete disabled modules/drafts, leave old six untouched. After any future deployment, immutable onchain positions cannot be removed by Git rollback; halt new virtual trading through separately approved roles, preserve claims/indexer/audit data, and review remediation. Never delete financial history or run a destructive down migration as a “rollback.”
