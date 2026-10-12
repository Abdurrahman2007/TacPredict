# AI Market Agent — architecture (safe defaults)

AI discovers and drafts markets. **Users** discover prices via TacPredict’s own **CLOB**. **Oracle + immutable rules** decide outcomes. AI never fabricates odds, prices, balances, or winning outcomes.

## Pipeline (live on `development/base-usdc`)

```
Polymarket Gamma API
  → Market Import Agent (fetch → normalize → categorize → dedupe)
  → Validation & policy (rules, source, deadline, AI clarity, legal flags)
  → Candidate queue (REVIEW_REQUIRED / REVIEWED / REJECTED)
  → TacPredict Factory draft (own Market ID + USDC CLOB config) — preview only
  → Human / policy-approved publisher → Factory createMarket
  → Indexer → public feed → native orders → oracle → settlement
```

Polymarket Gamma metadata and (optional) CLOB books are **never** mixed into TacPredict financial state. Odds/volume may be stored as `validation.externalReference` only.

## Separation of duties

| Actor | Allowed | Forbidden |
|---|---|---|
| Market Agent | Scan Gamma, draft questions/criteria/sources, duplicate fingerprints, enqueue candidates, AI clarity review | Set YES/NO price, pick winners, edit balances, bypass pause/roles |
| Validation / policy | Reject ambiguous/duplicate/high-risk drafts | Auto Mainnet publish without reviewed publisher |
| Publisher (human or approved relayer) | Wallet-signed Factory `createMarket` after simulation | Blind AI→contract calls |
| Users / matcher | Orders, fills, CLOB mid from trades | — |
| Resolution oracle | Bonded propose / dispute / finalize per contract | Shorten 24h challenge; invent evidence |

## What is imported vs owned

| Polymarket | TacPredict |
|---|---|
| Question / title | Own market question |
| Description / rules | Verified → own rules |
| Category / tags | Own category |
| Outcomes | Binary / supported multi |
| Start/end time | Proposed schedule |
| Resolution source | Reference for review |
| Current odds | `externalReference` only |
| Volume/liquidity | External comparison only |
| Polymarket ID/slug | `source + source_market_id` unique key |

Source market ID ≠ TacPredict market ID. Polymarket YES/NO tokens, liquidity, and resolution results are never used in TacPredict contracts.

## Current repo status

- **DONE**: Discovery worker (`import-core.mjs` + Cloudflare cron every 15m), candidate tables, AI clarity review, admin MFA UI at `/admin/market-importer`, factory draft preview helper, unique `(source, source_market_id)` + fingerprint dedupe, `auto_publish` hard-locked `false`.
- **PARTIAL**: Admin category/interval editing UI; semantic near-duplicate beyond fingerprint.
- **GATED**: On-chain Factory publish from candidates (requires authorized publisher + simulation).
- **BLOCKED until approval**: `MAINNET_MATCHING_APPROVED`, global unpause, AI Mainnet publish wallet.

## Admin surface

`/admin/market-importer`

- Auto Import toggle / emergency pause
- Auto Publish: policy controlled (OFF)
- Counts: Discovered · Validated · Published · Rejected
- Candidate queue, rejection reasons, source link, AI review, factory draft preview
- Run discovery now, last successful sync, audit runs

## Hard policy for any agent prompt

You may discover and draft markets. You may NOT fabricate data/sources, determine market prices, manipulate odds, determine winning outcomes, modify user balances, bypass resolution rules, or bypass smart-contract permissions. Auto-publish to Base Mainnet requires explicit human policy + funded authorized publisher — default is draft-only.
