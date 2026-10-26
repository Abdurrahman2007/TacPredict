# Private Base Mainnet canary — roundtrip verified, NOT public trading

## Current result

The separately approved private QA deployment, 100 Virtual USDC allocation, QA pool, Buy and Sell are confirmed. Earlier preparation/pending reports are historical, not current status.

- Engine: `0x424c08d85A2f80f85A0C9330888BfB54a292491B`, Base chain 8453.
- Buy: `0x94d4cee23fb2216f71285952a43bc865d48efafcfe5ec220a8ce272fc6596721`, block 53121350. Spent 1 Virtual USDC; received 1.9999 shares.
- Sell: `0x17248450f8903d4d1b5ef410ede2ae014cd5024576efc7756c77135922fd0211`, block 53121560. Sold all 1.9999 shares; received 0.999999 Virtual USDC.
- Final private balance: **99.999999 Virtual USDC**; shares and basis zero; realized PnL **-0.000001 Virtual USDC** (fixed-point rounding). This is non-redeemable internal accounting, not wallet USDC.
- Actual application receipt verifier checked one expected engine trade per distinct transaction, exact wallet/market/side/input/nonce, canonical block and successful receipt. Five historical receipts were rechecked against canonical blocks.
- Chain state matches the application's wallet projection. Replaying duplicate events is idempotent. Global accounting conservation holds. Status recorded as confirmed, not an unsupported finality claim.
- QA pool is not an actual crypto/sports event; QA activity excluded from TAC Points/ranking. No open position remains. This is not settlement/oracle or public UI E2E evidence.

## Gas scope

Administrator-specific EntryPoint UserOperationEvent actualGasCost totals **0.0000352496105 ETH** across deployment, setup, pool, Buy and Sell, below the approved 0.0001 ETH cap. See gas-ledger.json. Observed native wallet balance and EntryPoint deposit are separate gas resources, not virtual balance or additional spent gas.

The Sell transaction also contains another wallet's unrelated bundled operation. Its asset transfers and costs must not be attributed to this virtual trade. Our Buy and Sell have different transaction hashes, each with exactly one expected engine trade. Operation-specific gas is not a claim of exhaustive wallet-level L1/service-fee reconciliation.

## Preserved boundaries

Six legacy contracts untouched; no real-USDC collateral/approval/redemption path used. No production app merge, environment/secrets/flag change, migration, public campaign or public activation. Manifest is review evidence, not runtime configuration. No approval URLs or request identifiers committed. No further transaction pending for this roundtrip.

## Remaining release gates

- Review/approve production application integration and additive migrations; validate staging auth/RLS, continuous indexer/reorg recovery and monitoring before changing production.
- Validate real crypto/sports feeds, market lifecycle, resolution and failure recovery separately. A QA Buy/Sell does not establish these.
- Finish security/dependency triage and appropriate legal/disclosure/geographic review.
- Explicitly approve public balance eligibility/budgets and provisioning: this canary's immutable grant cap is only 100 Virtual USDC total and already allocated; do not present it as a scalable public campaign engine.
- Public deployment/configuration and trading activation each require separate approval. Public trading is **not live** from this evidence.

No protocol source changed in this evidence-only update. Prior local test results are not reclassified as Mainnet verification. Evidence JSON records receipt/event/state checks, not production database writes.
