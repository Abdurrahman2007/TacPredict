# Sepolia createPool → Buy/Sell (after roles verified)

## Verified

- Engine: `0xCF59F3Ff524cC1bD4e11177937D3BCBE62860E46`
- `0x57828f…7AeF`: DEFAULT_ADMIN + CREATOR + PROPOSER ✅ (txs above)
- `0x57828f…` Sepolia ETH: **0** ❌ cannot sign
- `0x6397…610f` ETH: **~0.011** ✅ but **no CREATOR/PROPOSER**
- Mainnet Chainlink addresses on Sepolia: **no code** ❌

## Manual steps (you sign locally — no keys in chat)

### A) Unlock a funded CREATOR (pick one)

**Option A1 — recommended:** grant CREATOR (+ PROPOSER) to funded wallet `0x6397…`  
(from either admin that already has DEFAULT_ADMIN):

```bash
export MY_LOCAL_KEY='…'   # local only
export ENGINE=0xCF59F3Ff524cC1bD4e11177937D3BCBE62860E46
export RPC=https://sepolia.base.org
export FUNDED=0x6397A026560e7b66584F087739b15AE2bda8610f

cast send $ENGINE "grantRole(bytes32,address)" \
  0x828634d95e775031b9ff576b159a8509d3053581a8c9c4d7d86899e0afcd882f \
  $FUNDED --rpc-url $RPC --private-key "$MY_LOCAL_KEY"

cast send $ENGINE "grantRole(bytes32,address)" \
  0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1 \
  $FUNDED --rpc-url $RPC --private-key "$MY_LOCAL_KEY"
```

**Option A2:** faucet-fund `0x57828f…7AeF` on Base Sepolia instead.

Send the new grant tx hashes (or faucet confirmation). We re-verify, then give exact `createPool` calldata with timestamps.

### B) Deploy MockFeed × 2 (price + sequencer)

```bash
cd TacPredict/protocol/virtual
VIRTUAL_TESTNET_RPC_URL=https://sepolia.base.org \
  node scripts/prepare-mock-feeds-sepolia.mjs launch/approved-sepolia/mock-feeds-unsigned.json

# Deploy twice with cast --create using .deploy.data from that JSON
# Then push:
#   FEED: push(BTC price * 1e8, now)
#   SEQ:  push(0, now-4001)   # sequencer up
```

Reply with both mock contract addresses.

### C) We then provide (after A+B)

1. Exact `createPool` + `configurePricePolicy` cast lines (24h-style window; not 5m settle claim)  
2. `captureStart` with round ids  
3. Separate `buy` then `sell` cast lines  
4. Receipt verification by this agent (public RPC)

XRP stays disabled. No Mainnet.
