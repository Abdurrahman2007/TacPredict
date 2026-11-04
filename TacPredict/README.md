# TacPredict

Virtual-only crypto prediction app (TanStack Start / React). Public product:
crypto Up/Down for BTC, ETH, SOL and BNB in 5m, 30m, 1h, 12h and 24h windows.
Navigation is Home, Rewards, Ranking, Portfolio. The public Markets list was
removed in the virtual-only cleanup.

## What is real and what is not

- **Virtual USDC** is internal, non-transferable and non-redeemable. It is not
  real USDC, not money and not a claim on any treasury.
- **Paper trades** are gas-free, stored on the device, and unsettled until
  server settlement exists. Paper balances never feed rewards, rankings or
  payouts.
- **Onchain Virtual USDC** stays on Base Mainnet (8453). Every onchain
  buy/sell/settle still needs a real wallet signature and real ETH gas on
  Mainnet, even though the token itself is virtual/non-redeemable.
- **Real-USDC pool trading is hard-blocked.** Operator Mainnet signing is
  disabled unless the non-default build flag `VITE_ENABLE_OPERATOR_SIGNING=true`
  is set; admin gating is unchanged.
- **TAC Points** are points only — not USDC and not a token. They may be
  considered for a future token/airdrop only if announced. No token, airdrop,
  price or date is promised. See the Terms page.
- **Fees/sponsor work is deferred.** No fee subsidy or low-fee promise exists
  in this phase.

## Develop

```sh
npm ci
npx tsc --noEmit
npm run build
```

Production target: https://tacpredict.fun (see `DEPLOYMENT.md`).
Provider keys stay behind server functions — never in `VITE_*` variables and
never in this README. Do not rewrite published git history (see `AGENTS.md`).

## Status

Work in progress on branch `feature/virtual-only-cleanup` (local only, not
pushed or deployed). Missing values are shown as unavailable, never as
verified zeros, except where a zero is verified.
