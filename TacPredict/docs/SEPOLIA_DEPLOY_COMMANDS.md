# Base Sepolia VirtualPriceAMM — reproducible deploy (unsigned)

**Chain 84532 only. No Mainnet. No private keys in Cursor.**

## Your test wallet (public)

`0x6397a026560e7b66584f087739b15ae2bda8610f`

## 1) Fund (manual — shortest path)

1. Open https://docs.base.org/get-started/get-funds  
2. Use **Coinbase Developer Platform faucet** (or listed Base Sepolia faucet).  
3. Network: **Base Sepolia**. Address: paste `0x6397a026560e7b66584f087739b15ae2bda8610f`.  
4. Request test ETH. Target **≥ 0.005 ETH** (you currently have **0.001 ETH** — enough for deploy estimate, tight for full Buy/Sell/keeper; top up if txs fail).

## 2) Prepare unsigned deploy calldata (local, no broadcast)

```bash
cd TacPredict/protocol/virtual
export VIRTUAL_TESTNET_RPC_URL=https://sepolia.base.org   # public; or your Sepolia RPC — do not commit secrets
node scripts/prepare-price-sepolia.mjs \
  launch/approved-sepolia/plan-0x6397.json \
  launch/approved-sepolia/unsigned-0x6397.json
```

Budgets match prior approval: seed `10000000000` atoms, grant `100000000` atoms.

## 3) Sign & broadcast safely (you — wallet app)

**Do not paste a private key into Cursor.**

### Option A — MetaMask / Rabby (recommended)

1. Wallet → Network **Base Sepolia**.  
2. Use a “deploy contract” / custom TX tool that accepts:
   - `to`: empty / contract creation  
   - `data`: `data` field from `unsigned-0x6397.json`  
   - `value`: 0  
3. Or Foundry on **your machine** (key never leaves your laptop):
```bash
# On YOUR machine only — key via env you control, not chat
cast send --rpc-url https://sepolia.base.org --private-key "$MY_LOCAL_KEY" \
  --create "$(jq -r .data launch/approved-sepolia/unsigned-0x6397.json)"
```
4. Save **deployment tx hash** + **contract address** from the receipt.

### Option B — Frame / Safe / hardware

Same unsigned `data`; sign with your preferred local signer.

## 4) After deploy — tell the agent only

- Engine address `0x…`  
- Deploy tx hash  
- Confirm you will sign later txs in wallet  

Then we continue: roles, one test pool, Buy, Sell, expiry, settle (you approve each wallet popup).

## Gas notes

Prior estimate (~3.57M gas): L2 fee ≪ 0.001 ETH; L1 data fee varies. If deploy reverts for funds, faucet again to ~0.01 ETH (prior test cap).
