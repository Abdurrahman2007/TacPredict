# AI Market Agent — architecture (safe defaults)

AI discovers and drafts markets. **Users** discover prices via the existing **CLOB**. **Oracle + immutable rules** decide outcomes. AI never fabricates odds, prices, balances, or winning outcomes.

## Separation of duties

| Actor | Allowed | Forbidden |
|---|---|---|
| Market Agent | Scan providers, draft questions/criteria/sources, duplicate/risk scores, enqueue drafts | Set YES/NO price, pick winners, edit balances, bypass pause/roles |
| Validation / policy | Reject ambiguous/duplicate/high-risk drafts | Auto Mainnet publish without reviewed publisher |
| Publisher (human or approved relayer) | Wallet-signed Factory `createMarket` after simulation | Blind AI→contract calls |
| Users / matcher | Orders, fills, CLOB mid from trades | — |
| Resolution oracle | Bonded propose / dispute / finalize per contract | Shorten 24h challenge; invent evidence |

Deployed Exchange is **CLOB**, not AMM. There is no fee/treasury sweep API. Trading remains paused until explicit reviewed unpause.

## Pipeline (target)

```
providers → agent candidates → validation → drafts → risk/policy
  → (admin approval | allowed auto-queue) → publisher → Factory
  → indexer → public feed → user CLOB → close → oracle → settlement → USDC claim
```

## Current repo status

- **DONE**: Native protocol contracts, feed, orders/execution, prepare metadata, operator console, admin AAL2 reads.
- **PARTIAL**: Admin shell; unsigned oracle evidence tooling (`prepare-oracle-evidence.mjs`).
- **MISSING**: Discovery workers, candidate tables, auto-publish, funded matcher, AI agent runtime.
- **BLOCKED until approval**: `MAINNET_MATCHING_APPROVED`, global unpause, AI Mainnet publish wallet.

## Hard policy for any agent prompt

You may discover and draft markets. You may NOT fabricate data/sources, determine market prices, manipulate odds, determine winning outcomes, modify user balances, bypass resolution rules, or bypass smart-contract permissions. Auto-publish to Base Mainnet requires explicit human policy + funded authorized publisher — default is draft-only.
