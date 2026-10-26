# Deployed private Base Mainnet canary — NOT public trading

This supersedes the earlier **not-deployed** status in the timestamped preparation reports. The user separately approved this new private Mainnet canary and max cumulative gas of 0.0001 real ETH; production migration/config/merge/public activation remains outside scope.

- Successful canonical deployment transaction: `0x955e6210f5a598e9f605ab89607e9c157e553eb234d3c366a462ea8ccca0b2f9`.
- Engine: `0x424c08d85A2f80f85A0C9330888BfB54a292491B`, block `53120634`.
- Factory runtime, deterministic address, exact reviewed engine runtime (immutable masking), immutable 10,000 pool / 100 grant caps and administrator ownership verified against chain. Constructor RoleGranted evidence and absent previous-block code verified.
- Deployment-block state: zero pools, campaigns, grants, seeded liquidity and cash. This is a deployed accounting engine, NOT proof of working public trading.
- Operation-specific EntryPoint UserOperationEvent: success=true, paymaster=zero, actualGasCost=0.000026384865 ETH. Whole transaction fees are tracked separately; gas deposits are NOT additional spent gas or trading balance. See gas-ledger for observed wallet/EntryPoint resources and reconciliation caveat.
- Next prepared approval: four new-engine calls, grant creator+guardian only to approved admin, configure one-wallet 100 Virtual USDC Merkle allocation, claim it for the same wallet. Sequential Mainnet read-only simulation: 4/4 success, 366,251 target gas. No pool or Buy/Sell in that approval. No real asset transfer/approval. Seven-day expiry. **Allocation not confirmed yet.**
- Request/approval URLs are deliberately NOT committed; private pending request reference prevents duplicate submissions. On approval, verify canonical successful receipt, every required event/state and UserOperation outcome/cost before continuing. Stop on mismatch/reorg; never trust approval status/hash alone.
- All six legacy contracts untouched. No real-USDC collateral path, production schema/env/secrets/flag change, main merge or app activation. New manifest is review evidence, not runtime configuration.

Next gates: confirm private allocation; prepare explicit immutable QA pool rules/timing; separately submitted Buy and Sell receipts; reconcile virtual balances/shares/PnL and cumulative real gas. Keep real market-source, backend/indexer/RLS, security and public-launch gates separate. Do not describe the site as live on deployment evidence alone.
