# Sepolia QA runbook — createPool → Buy → Sell

**Preflight (verified on-chain)**
- Funded `0x6397…610f`: DEFAULT_ADMIN + CREATOR + PROPOSER, ~0.011 ETH
- Engine `0xCF59F3Ff524cC1bD4e11177937D3BCBE62860E46` — `poolCount=0`
- FEED `0x657F55EdDeb1ab37F1bebF99824147B60fC47Aca` / SEQ `0x5408ef3943d478E0d2F039C6C95a561A9C24eD02`

Artifacts (regenerated with timed schedule):
- `protocol/virtual/launch/approved-sepolia/qa-flow-0x6397.json`
- `protocol/virtual/launch/approved-sepolia/qa-flow-0x6397.sh`
- Regenerator: `OPEN_IN_SEC=720 node protocol/virtual/scripts/prepare-qa-flow-sepolia.mjs`

**Private keys stay on your machine. Never paste into Cursor.**

---

## Run (laptop, before `openAt`)

```bash
cd TacPredict/protocol/virtual
# If openAt already passed / <2 min left:
OPEN_IN_SEC=900 node scripts/prepare-qa-flow-sepolia.mjs

export MY_LOCAL_KEY='…'   # local only — funded 0x6397…
./launch/approved-sepolia/qa-flow-0x6397.sh
unset MY_LOCAL_KEY
```

The script waits for `campStarts` and `openAt`, then runs:
1. SEQ push + FEED round 1  
2. `createPool` → `configurePricePolicy` → `configureMonthlyCampaign`  
3. `claimGrant` (100 vUSDC)  
4. FEED round 2 + `captureStart(1, 2)` (must be ≤ `openAt + 300s`)  
5. `buy` $5 Up then separate `sell` all shares  

It prints seven tx hashes at the end.

---

## Reply here with (hashes only)

1. createPool  
2. configurePricePolicy  
3. configureMonthlyCampaign  
4. claimGrant  
5. captureStart  
6. buy  
7. sell  

I verify each receipt + cash/PnL on public Sepolia RPC. No Mainnet. XRP still off.
