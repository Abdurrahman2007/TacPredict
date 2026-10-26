# Review, validation and separate launch approvals

## Reproduce locally

From repository `TacPredict/`:

```sh
npm ci
npm --prefix protocol/virtual ci
npm --prefix protocol/virtual run compile
npm --prefix protocol/virtual test
npm run typecheck
npm run build
npm --prefix protocol ci
npm --prefix protocol test
# Full lint has known baseline failures; record, do not silently suppress.
npm run lint
```

Hardhat uses isolated local valueless accounts; new-engine test RPC port 18549 and original virtual test port 18547. Mock-feed E2E is not a testnet or real-provider SLA result. Production root environment is not required for compile; disconnected UI comparisons used dummy local Supabase public settings, not production credentials or private user data.

## Base Sepolia — pending explicit signing/funding authority

No Sepolia deployment or test transaction performed in this change. No keys accessed. To prepare unsigned data only:

1. Review the new source/model/threat report and approve virtual seed/grant lifetime caps plus administrator address. Prepare a local JSON file: `{ "chainId":84532, "admin":"<approved address>", "seedBudgetAtoms":"<approved integer>", "grantBudgetAtoms":"<approved integer>" }`. No default grant or reward amount is chosen.
2. Set **server/local-only** `VIRTUAL_TESTNET_RPC_URL` to a Base Sepolia read RPC. Run `node protocol/virtual/scripts/prepare-price-sepolia.mjs plan.json unsigned.json` from the app directory. It only compiles/estimates/writes calldata; cannot sign or send. Never use a Mainnet RPC or send its data to Mainnet.
3. Separately authorize a wallet-held testnet deployment transaction and test ETH gas budget. No seed/private-key input is needed. Verify successful receipt, actual engine runtime/immutable budgets/admin and absent automatic roles/campaigns/pools. Record source/compiler/initCodeHash and block evidence.
4. Use explicitly configured testnet feeds (or clearly identified **test-only** mock fixtures), role separation and a private test allocation with separate approval. Testnet feed precision/identity/rounds must be verified independently; do not reuse Mainnet feed addresses.
5. Exercise exact separate Buy/Sell receipts, partial/full sells, stale feed/sequencer outage, concurrent nonce/revision, oversell, reserve exhaustion, start/close boundary failures, challenges, winning/losing/void settlement and campaign time/pause/cancel/duplicate proof. Reconcile chain through staging indexer/Supabase RLS and actual wallet UI. Capture receipt and visual evidence. Passing mocks does not certify real boundary availability.

## Runtime environment — names only

- `VIRTUAL_TRADING_CONFIG`: approved chainId/engine/codeHash/startBlock/enabled/model and frozen market metadata; `feed-v1` additionally requires pricePolicyHash and crypto asset/tie policy matching the immutable contract policy. Not a client secret; no deployment enabled by this PR.
- `VIRTUAL_RPC_URL`: server read RPC for the exact configured chain, reliable archive/log/receipt/finalized-tag support. Secret project tokens server-only.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`; browser public counterparts `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` for the same reviewed project.
- `SUPABASE_SERVICE_ROLE_KEY`: server/indexer only; never VITE-prefixed or logged. Apply approved additive migrations only to approved project.
- Existing wallet connector public project configuration; no frontend operator/relayer/oracle private key. No sponsorship.
- Optional `COINGECKO_DEMO_API_KEY` for reference charts, not execution/settlement.
- `VIRTUAL_TESTNET_RPC_URL` for unsigned testnet preparation only.
- A production keeper/signing service, fast oracle integration and their environment/permissions are **not provisioned**; must be separately designed/approved before adding secrets. No false list of configured signers.

Minimum app permissions: verified wallet ownership for user reads/trade preparation/observation; Supabase admin+AAL2 for campaign preview/operations. Server service role for fenced projections and atomic audit/draft writes. Contract roles are independent of app admins. Limit RPC keys to read calls unless a separately approved signing architecture is introduced. Do not expose service keys in client bundles.

## Production approval checklist — none executed here

- [ ] Approve fast verifiable source/cadence/licence and five asset mappings; validate failures, boundary SLA and volatility calibration. Existing aggregator inspection is insufficient for short markets.
- [ ] Independent contract/economic/security review; resolve new-engine risks and existing dependency advisories.
- [ ] Complete genuine testnet/staging wallet/auth/DB/indexer/provider E2E and monitoring rehearsal.
- [ ] Approve public eligibility, lifetime grant and seed budgets, role holders/multisig and deployment fee limit. No automatic monthly campaign.
- [ ] Separately approve **new Mainnet engine deployment**; preserve old six and private canary addresses. The private canary cannot be upgraded into the new model.
- [ ] Verify deployment bytecode/immutables/roles/events and register deployment only after proof. No public campaign/grants/pools automatically.
- [ ] Separately approve v1/v2 additive production migrations, tested backup/recovery and RLS/ownership isolation; do not run destructive rollback or edit cash in SQL.
- [ ] Separately approve production branch merge/build release, runtime environment and continuous indexer/keeper/monitor configuration. No secret changes without approval.
- [ ] Verify market metadata/policy hashes, approved virtual liquidity, oracle start/expiry/challenge/void actions, portfolio/points isolation and five asset E2E. Any test allocation needs explicit separate authorization.
- [ ] Obtain appropriate legal/privacy/consumer/geographic/user-disclosure review. Virtual, non-redeemable units do not by themselves resolve legal applicability. No real-TAC promise.
- [ ] Separately approve public trading activation only after critical gates pass. Monthly campaign publication and any rewards remain distinct future approvals.

## Incidents and rollback

Before release: close/revert the draft branch; no production state changed. After an eventual approved release: authorized guardian can pause **new engine** trading, independently disable public trade preparation, and stop the new keeper/indexer if evidence is inconsistent. Existing legacy contracts must not be paused/changed as a side effect. Do not zero accounts or delete onchain/history data. Preserve receipts, orphan records, checkpoint fences and incident audit. Reconcile reorgs; halt on finalized mismatch. Use immutable deadline-based void/settlement rules rather than inventing a result. Public pause may also prevent sells; communicate this risk. Deployments/finalized events are not reversible; app rollback must never route users back to real-USDC trading. Restore read-only mode with verified state, not a fictitious balance. Escalate source compromise, role-key compromise and insolvency invariant failures; resume only with explicit review/authorization.
