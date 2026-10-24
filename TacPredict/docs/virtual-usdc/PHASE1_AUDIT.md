# TacPredict Virtual USDC — Phase 1 architecture audit

**REVIEW ONLY. No protocol implementation or production approval.**

Audited repository: `Abdurrahman2007/TacPredict`, remote `main`, commit `2da5ae195cec916206e217ca71182b1baa8c39f7`. App root: `TacPredict/`. Isolated checkout: `tac-virtual-phase1`; original worktrees were inspected for branch/dirty state and left untouched. No secrets were read, changed, or copied.

## Evidence labels
- **Source-verified (SV):** inspected committed source/configuration; not proof of deployed runtime behavior.
- **Locally tested (LT):** a command was executed in the isolated checkout; details in VALIDATION.md.
- **Production-verified (PV):** requires a specific live observation and block/deployment evidence. **No new production checks are claimed in this phase.** Historical verification files are source records, not fresh live observations.
- **Unverified (UV):** proposal, provider availability, business decision, or behavior not yet tested.

The request's final safety rules override the earlier request to start trading. This phase cannot activate trading. Prediction UI source is not modified.

## Repository architecture [SV]

| Area | Actual implementation / evidence |
|---|---|
| Frontend | React 19.2, TypeScript, TanStack Start/Router/Query, Vite 8, Tailwind 4; package.json |
| Wallet | Wagmi 2, RainbowKit, viem, Coinbase/injected/WalletConnect/Farcaster connectors; src/lib/web3/config.ts |
| Session | Supabase Web3 SIWE sign-in; src/lib/onchain/wallet-auth.ts and auth middleware |
| Proven wallet ownership | Server-created 5-minute challenge, signature verification, atomic one-use consume; src/lib/protocol/wallet-link.server.ts; migration 0010 |
| Real-money CLOB | protocol/contracts/{MarketRegistry,MarketFactory,ConditionalPositions,Exchange,ResolutionOracle,Settlement}.sol |
| Additional protocol | UpDownPool.sol and src/lib/pool/*: actual USDC pari-mutuel pool, not a virtual Buy/Sell exchange |
| Financial read models | Supabase protocol_* tables, RLS, privileged event RPCs; migrations 0004–0020 |
| Account/referral metadata | Cloudflare D1 TAC_ACCOUNTS; database/accounts.sql; src/lib/accounts/worker.mjs; not collateral |
| Runtime | Custom Cloudflare SSR fetch/scheduled wrapper; scripts/package-cloudflare.cjs |
| Scheduled operations | Existing CLOB indexer, discovery, and optionally configured pool reporter are distinct jobs; do not run them during this task |
| Admin | Existing /admin workspace, assigned Supabase admin + AAL2, onchain wallet roles separately checked |
| Ranking | Finalized real Exchange activity in src/lib/ranking/*; not monthly virtual points |

Package inspection and build-time versions do not prove production service configuration. No framework migration is necessary.

## Existing six-address preservation [SV]

Source of addresses: protocol/deployments/base-mainnet.json (chain 8453). No address is to be replaced, upgraded, redeployed, activated, or paused/unpaused by this work.

| Contract | Existing address | Compatibility decision |
|---|---|---|
| MarketRegistry | 0x8aCC19eb2F3DCCEdA99Af89cC30416D17f02cd0A | Reuse immutable-terms/state-machine concepts; new virtual namespace/store recommended. Do not write virtual activity here. |
| MarketFactory | 0xe01c23aac6f152a2eA437A7E6Eb0a664A1908568 | Reuse metadata canonicalization ideas, not production create calls. |
| ConditionalPositions | 0x00adb2c69B58f66aB64DDb0Da01B7C72A3E8F2A7 | Incompatible: locks real USDC, ERC1155 shares transfer, real payout redemption. Never call from virtual engine. |
| Exchange | 0x7e5e40bAE779ebabB2295Ef6d009ab95b0307F85 | Incompatible: buyer USDC transfer plus seller ERC1155 transfer. Signed order alone is not execution. |
| ResolutionOracle | 0xF50797C34B214C81B80A9bd3e590C3cA0DF8118f | Existing bond is 5 real USDC and challenge is 86400s; reuse process/evidence concepts only. New virtual resolver avoids real collateral and old-contract writes. |
| Settlement | 0x9b272C68F3338655a440B44DBc9CCB993D7650B3 | Incompatible payout route: redeems real-collateral shares. Separate virtual settlement required. |

Manifest native USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Its presence is a safety boundary, not a token to import into the virtual engine. Source records report verified=true, trading_enabled=false and an unaudited deployment; they are not a fresh live status check. All six production contracts are directly addressed, not upgradeable application proxies.

## Findings and blockers

| ID | Classification | Finding | Required response |
|---|---|---|---|
| F01 | SV, launch blocker | The six-contract economic path is real USDC, not virtual credits. | New isolated virtual contract(s), ABI, deployment namespace and indexer. Never reuse real transfer/approval helpers. |
| F02 | SV, launch blocker | UpDownPool also transfers real USDC; no general partial Buy/Sell implementation. Checked-in fallback address is empty, but environment override can exist. | Do not assume undeployed/disabled from the empty fallback. Do not use as virtual engine. |
| F03 | SV | placeLimitBuy/placeLimitSell sign and store orders; fillOffer is a separate receipt-checked transaction. | New execution adapter must require receipt + exact virtual event; API order acknowledgement is never a trade. |
| F04 | SV/UV, design gate | A normal CLOB fill produces a buyer and seller leg in one transaction. | Strict per-action/per-transaction requirement favors one-user-vs-protocol virtual inventory. Obtain explicit policy before using a paired-user fill model. |
| F05 | SV + specification research | ERC-4337 bundles UserOperations, and wallet_sendCalls can batch calls. UserOp/call ID is not an L2 transaction hash. | No batched Buy/Sell. Sponsorship must satisfy one successful trade per L2 receipt; otherwise fallback, not silent relaxation. |
| F06 | SV | Existing indexer is finalized-only, has receipt/canonical checks, unique event keys and fenced checkpoints; checkpoint mismatch halts. | Reuse patterns, not existing address filters/projections; add provisional-state and controlled reorg-replay layers. |
| F07 | SV | Existing event and checkpoint namespaces primarily key by chain; real CLOB and virtual engine cannot share a cursor. | Add deployment-scoped virtual checkpoints/leases; namespace all identifiers. |
| F08 | SV | Account/referral D1 records are private promotional metadata; they are not onchain spendable funds. | Never auto-convert referral totals or legacy rewards into the 500 grant. Separate approved grant campaign. |
| F09 | SV/UV | Wallet uniqueness is not human uniqueness; existing first-signup/referral checks do not stop multiwallet farming. | Eligibility authority, review/nullifier policy and abuse controls must be approved. No Sybil-proof claim. |
| F10 | SV | Actual supported window lists differ: durations [5,15,720,1440], display also 60; requested 30 and full six-window publishing are not implemented uniformly. | One virtual-series config for 5/15/30/60/720/1440; no claim that a displayed card is a tradable market. |
| F11 | SV/UV | Templates name BNB-USD Coinbase candles; listing/feed availability is not established by a string constant. Football PD/CL and cricket parsers exist; live access/coverage unverified. | Verify each instrument, fixture source, final result semantics, timestamp coverage and API license before publishing. Fail closed on missing data. |
| F12 | SV | Existing Oracle challenge is immutable 24h; template resolveAfter is not final payout time. | Separate virtual resolution policy; no promise of five-minute final settlement. |
| F13 | SV | No configured paymaster/bundler execution adapter or sponsorship budget controller was found in current app transaction helpers. | Provider and chain capabilities, policy and funding remain unverified. |
| F14 | LT | Repo-wide lint has pre-existing failures; dependency advisories exist. | Report baseline truthfully; do not auto-fix unrelated prediction UI or change locks during audit. |

## Reusable / non-reusable boundaries

Reuse after tests: UI layout/components, exact BigInt display conventions, authenticated wallet ownership workflow, admin role/AAL2 guard, canonical immutable metadata, fixture parsers as suggestions, evidence hashing, lease fencing, atomic event application and exact event ordering.

Do not directly reuse: real USDC balance/allowance/approval functions, ConditionalPositions token IDs/redemption, Exchange signing domain or execution methods, Pool bet/claim path, legacy profiles.balance, D1 reward totals, real-money ranking PnL, or chain-only indexer cursor.

Source-level grants/RLS are reviewed, not freshly introspected in production. No assertion is made that every migration is deployed or that live RLS/budget/cron behavior matches source.

## Scope of this review-only change

Only documentation/evidence is added. No Solidity, TS execution code, UI, SQL migration, workflow, environment variable, secret, deployment manifest, or production record is changed. Implementation starts only after architecture decisions are reviewed. See ARCHITECTURE_PROPOSAL.md and IMPLEMENTATION_GATES.md.
