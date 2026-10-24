# User-approved Base Mainnet private canary — not deployed

## Explicitly approved scope
- Base Mainnet 8453, approved administrator `0x57828f1aa32fd6be3988f240068df53ed94b7aef`.
- New separate VirtualAMM only: immutable pool seed cap 10,000 Virtual USDC; private single-wallet allocation cap 100 Virtual USDC; maximum **cumulative** test gas spend 0.0001 real ETH.
- No public campaign, real-USDC transfer, production merge/config/migration/trading activation, or changes to the six existing contracts.
- “Private” means internal QA without public app activation, NOT blockchain privacy. Mainnet transactions/state are publicly visible.

## Signing route prepared and locally tested
The wallet connection requires a target address for raw calls, so it cannot directly submit the earlier EOA creation payload. The canonical non-upgradeable Arachnid CREATE2 deployment proxy at `0x4e59b44847b379578588920ca78fbf26c0b4956c` provides a compatible single-call route. Its Mainnet runtime was compared byte-for-byte with the published historical deployment transaction, not merely trusted by address. Runtime hash: `0x2fa86add0aed31f33a762c9d88e807c475bd51d0f52bd0955754b2608f7e4989`.

Source: https://github.com/Arachnid/deterministic-deployment-proxy . **Zero ETH value** is sent to the proxy; only network gas is paid. The unchanged reviewed constructor assigns admin to the approved user, not the factory or submitter. Public salt/initcode front-running can only produce the same code and same admin; existing predicted code blocks blind retries and must be verified before proceeding.

- `scripts/deployment-proxy.mjs`: pure encoding, exact proxy/runtime checks.
- `scripts/prepare-mainnet-canary.mjs`: read-only live simulation and unsigned single-call payload. No signing/submission functions.
- `scripts/verify-mainnet-canary.mjs`: read-only receipt/source/immutable/admin and constructor-event checks for factory-created deployment, including smart-account/bundler top-level transactions. No claim of wallet debit from whole-transaction fees; reconcile actual Base Account/UserOperation costs before further spending.
- Local suite: **52 passed / 0 failed**, including three new proxy tests and preservation of all six legacy contracts. Typecheck and JS syntax checks passed. Actual Mainnet signing/session handling is not yet exercised.

## Current stop condition
See `plan.json` for the timestamped, read-only quote. Admin ETH balance was below the estimated deployment target cost even before smart-account overhead. The RPC gas simulation used a synthetic balance override; it did NOT fund the account. **No Base Account approval request or Mainnet transaction was submitted. Session spent: 0 ETH.** Predicted engine is not a deployed address.

The user must first hold sufficient **Base Mainnet ETH** in the approved admin wallet. Re-read balance and code, simulate again, get the full Base Account fee quote (including wallet overhead/L1 fees), and request its approval. Reject if prior actual cumulative fees plus the proposed maximum fee exceed 0.0001 ETH; this cap is not a fixed price or permission to exceed the balance. Do not send real ETH to the predicted engine or factory.

After a successful creation receipt: verify source, admin, immutable caps and zero initial grants/markets; record actual fee evidence. Only then prepare the one-wallet Merkle allocation, role assignments and explicitly frozen QA pool rules/times. Each later Buy/Sell must be separately submitted and have its own successful canonical transaction receipt/event; never batch them. No fabricated sports/crypto result and no production UI activation. Staging DB writes, public rollout and unresolved security/legal/data-source findings remain separate gates.

## Rollback and evidence
Only review-branch files changed. No Mainnet state exists to roll back. Discard tooling changes via reviewed revert if needed; never modify old contracts or delete evidence to bypass a recovery lock. Once any future Mainnet deployment occurs it is irreversible; stop further actions and retain the inactive isolated engine if review fails.
