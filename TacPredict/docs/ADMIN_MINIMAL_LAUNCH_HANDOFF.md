# Admin redesign and controlled trading handoff

## Delivered UI scope
- Six primary jobs: Overview, Markets, Create Market, Up/Down Pool, Users, Settings.
- Protected read-only dashboard: exact registered account total; indexed Exchange total/24h volume; exact native market counts; configured pool treasury's finalized Base USDC balance.
- Active means indexed OPEN + UPCOMING, not proof of executable trading. Pool rounds stay under Up/Down Pool and are not merged into Exchange totals.
- Markets: server pagination/search, All/Open/Closed, metadata type, execution volume and distinct buyer/seller wallets. Bounded/incomplete execution history returns unavailable, never a partial total.
- Published market title/rules/timing are immutable. Manage leads to operations; no fake edit or privileged database rewrite was added.
- Users: search, status, verified wallet links, details with finalized USDC balance and indexed execution count. Counts are not UpDownPool bets. No balance editing, custody transfer, or balance fabrication.
- Ranking, contracts, resolution, trades, providers, import and public-page settings remain accessible through Settings. All legacy routes remain valid.
- Sports creation: Basic Info, Rules, Timing, Resolution, Settings. Prepared terms and operator wallet simulation/approval remain mandatory. Guardian actions are hidden on the creation-only console, not removed from operational tools.

## Trading is NOT activated by this release
Existing Base Exchange contracts are already connected. Do not redeploy them. The separate UpDownPool has no committed address. A read-only inspection of production Worker binding names found neither UPDOWN_POOL_ADDRESS nor POOL_REPORTER_PRIVATE_KEY. Secret values were not requested or exported.

Before any real-fund action obtain:
1. Confirm operator wallet PUBLIC address and treasury PUBLIC address (may be the same).
2. Confirm whether an UpDownPool was already deployed outside this app; obtain its public address and receipt, verify source/runtime, USDC, chain, roles and configuration before connecting it.
3. Choose first pilot series (recommended only BTC 5m, not every asset/duration at once).
4. Approve fee, minimum stake, per-user and per-round caps; specify exact maximum ETH gas and USDC pilot budgets. These are proposals, not preauthorized spending.
5. Independent security, operational and jurisdiction/eligibility review. Terms text is not regulatory approval.

Next controlled sequence: verified deployment/configuration, authorized narrowly scoped price reporting and refund behavior, local EVM tests, funded isolated Mainnet lifecycle (bet -> boundaries -> result -> claim/refund) with wallet confirmations, receipt/finality/indexer comparison, monitoring/emergency pause; then explicit release approval. No new automated signer, secret, unlimited approval, deployment, treasury movement or unpause is introduced by this UI work.

The Exchange's immutable oracle challenge period and the Pool's reporting/claim rules differ. Do not claim the local test suite is a funded Mainnet trade or an independent audit.
