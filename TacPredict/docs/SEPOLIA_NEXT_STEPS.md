# Sepolia — after successful deploy (your wallet signs)

**Engine:** `0xCF59F3Ff524cC1bD4e11177937D3BCBE62860E46`  
**Deploy tx:** `0x180877487de5e87733e67025f4f70ef64f43bd68668cc51bdaac5226ed48530d`  
**Admin:** `0x6397a026560e7b66584f087739b15ae2bda8610f`  
**No Mainnet. No keys in chat.**

## What constructor already did

Admin received `DEFAULT_ADMIN_ROLE`. Markets/campaigns/trading are still off until you create a pool.

## Sign locally (same pattern as deploy)

On **your machine** only:

```bash
export MY_LOCAL_KEY='…'   # never paste into Cursor
export ENGINE=0xCF59F3Ff524cC1bD4e11177937D3BCBE62860E46
export RPC=https://sepolia.base.org
export ADMIN=0x6397a026560e7b66584f087739b15ae2bda8610f
```

### 1) Self-grant CREATOR + PROPOSER (admin)

Role hashes from VirtualPriceAMM:
- `CREATOR_ROLE` = `keccak256("CREATOR_ROLE")`
- `PROPOSER_ROLE` = `keccak256("PROPOSER_ROLE")`

```bash
CREATOR=$(cast keccak "CREATOR_ROLE")
PROPOSER=$(cast keccak "PROPOSER_ROLE")
cast send $ENGINE "grantRole(bytes32,address)" $CREATOR $ADMIN --rpc-url $RPC --private-key "$MY_LOCAL_KEY"
cast send $ENGINE "grantRole(bytes32,address)" $PROPOSER $ADMIN --rpc-url $RPC --private-key "$MY_LOCAL_KEY"
```

### 2) Reply here with those two tx hashes

Then we generate the exact `createPool` + `configurePricePolicy` calldata for **one** long BTC paper window (short 5m stays paper-only / not on-chain settle). You sign again locally; we verify receipts.

### 3) Buy / Sell

Separate txs only. After pool is live, we give `cast send` lines for `buy` then `sell` with minOut/revision/deadline/nonce — you approve each on your machine.

## XRP

Still charts-only; do not create XRP on-chain markets.
