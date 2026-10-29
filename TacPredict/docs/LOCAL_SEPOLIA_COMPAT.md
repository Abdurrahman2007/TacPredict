# Localhost ↔ Sepolia VirtualPriceAMM + Rewards

**Dev URL:** http://localhost:5180/

## What matches

| Surface | Behavior |
|---|---|
| Rewards box | One-time **$50–$500** Virtual USDC → paper ledger |
| Daily check-in | Credits same paper ledger |
| Home / Up-Down 5m | Paper Buy/Sell + settle robot (BTC/ETH/SOL/BNB; **no XRP**) |
| Portfolio | Paper balance / positions / PnL |
| Sepolia engine | `0xCF59F3Ff524cC1bD4e11177937D3BCBE62860E46` in `virtual-trading-config.json` |

## Local env (never commit `.env`)

```bash
cd TacPredict
node protocol/virtual/scripts/apply-sepolia-virtual-env.mjs
npx vite dev --port 5180 --host
```

Sets `BASE_SEPOLIA_PROTOCOL_RPC_URL` + `VIRTUAL_TRADING_CONFIG` from the approved Sepolia JSON.

On-chain catalogue needs the Supabase virtual indexer checkpoint. Until then the feed soft-fails and shows the engine pointer; **paper trading stays live**.

## Verified on-chain QA

See `protocol/virtual/launch/approved-sepolia/qa-verified-0x6397.json`.
