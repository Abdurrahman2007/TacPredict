# Keeper + scheduled worker setup (Sepolia-first)

**Production cron, production signer, Mainnet submit: DISABLED.**  
Do not put private keys in chat, git, or `.env` committed to the repo.

## What the keeper does

1. Plan unsigned actions via `planVirtualOperatorActions` (`captureStart`, `proposeFromFeed`, `finalize`, `timeoutVoid`).
2. Persist idempotency keys (`marketId:action`) so restarts / duplicates do not double-pay.
3. Optionally broadcast **only** on Base Sepolia (`84532`) or local Anvil (`31337`) when explicitly enabled.
4. Never send a transaction because a price tick updated.

Entrypoints:

- `protocol/virtual/scripts/operations.mts plan` — dry plan (no broadcast)
- `protocol/virtual/scripts/keeper-loop.mts` — dry-run by default; submit gated

## Environment variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `VIRTUAL_RPC_URL` | HTTPS RPC (Sepolia for test) | Yes for plan/submit |
| `VIRTUAL_TRADING_CONFIG` | JSON: chainId, engine, codeHash, startBlock, enabled, model `feed-v1`, markets… | Yes |
| `VIRTUAL_KEEPER_CHAIN_ID` | Must be `84532` for Sepolia submit | Yes if submit |
| `VIRTUAL_KEEPER_SUBMIT` | `true` only to attempt broadcast | Default unset/false |
| `VIRTUAL_OPS_INDEX_APPROVED` | `true` only for indexer DB writes | Optional |
| `BASE_SEPOLIA_PROTOCOL_RPC_URL` | Alternate Sepolia RPC | Optional |
| Operator signer | Injected on secured host only — **never** `VITE_*`, never committed | Yes for submit |

Signer wiring is intentionally **not** embedded in `keeper-loop.mts` until you approve a secured ops host. The loop fails closed with a clear error if submit is requested without an adapter.

## Roles / permissions (on VirtualPriceAMM)

| Role | Actions |
|------|---------|
| `CREATOR_ROLE` | `createPool`, `configurePricePolicy` |
| `PROPOSER_ROLE` | `proposeFromFeed` |
| Permissionless (when round known) | `captureStart`, `finalize`, `timeoutVoid` |
| `GUARDIAN_ROLE` | Pause |
| `ARBITER_ROLE` | Dispute adjudication |

Gas payer = operator EOA holding the needed roles + Sepolia ETH.

## Gas / funding

- Cap previously approved for private Sepolia prep: **0.01 Sepolia ETH** total (see `launch/approved-sepolia/estimate.json`).
- Observed admin balance at last estimate: **0 wei** → deploy/trade **blocked** until faucet.
- Faucet (official): https://docs.base.org/get-started/get-funds or CDP faucet — select **Base Sepolia** only.
- Alert if operator balance &lt; configured floor (ops host monitoring).

## Monitoring & recovery

- Structured JSON logs from `keeper-loop` / `operations.mts` (`status`, `idempotencyKey`, `error`).
- On failure: keep job `failed`, retry until `maxAttempts` (default 5); then page/alert.
- After restart: skip `done` keys; resume `pending`/`failed`.
- Stale/missing oracle rounds: planner omits action → market eventually `timeoutVoid` (no invented price).
- Duplicate settle: contract + idempotency key both reject double payout.

## Schedule (ops host — not registered in this repo)

Suggested cadence after Sepolia engine exists:

- Every 30s: `operations.mts plan` (observe)
- Every 30–60s: keeper tick with submit **only** on Sepolia staging
- Never enable Mainnet submit without a separate written approval

## Failure modes

| Condition | Behaviour |
|-----------|-----------|
| Mainnet chain id + submit | Hard throw |
| No signer adapter | Fail closed |
| Stale feed / no boundary round | Skip propose; later timeout-void |
| Tx revert | Job `failed`, retry |
| User browser closed | Irrelevant — keeper is server-side |
