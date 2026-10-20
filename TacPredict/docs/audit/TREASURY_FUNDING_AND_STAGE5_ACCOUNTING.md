# Stage 5 — treasury funding clarification and read-only fee diagnostics

**No production change, deployment, database mutation, funding, signer activation or trading activation.** PR #3 remains draft. Existing six contracts and the approved additional-buyer fee policy are unchanged. This continuation does not constitute an independent audit or complete the outstanding launch integration.

## Does treasury need starting USDC?

In the existing CLOB and the reviewed, undeployed FeeExchangeV2 model, there is no treasury USDC minimum simply to receive fees. A treasury balance of zero is not itself a trading blocker. This is an architectural statement, **not a fresh read of the treasury's current balance** or an assertion that trading is ready.

Funds have separate purposes:

| Purpose                           | Actual source / requirement                                                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Buying shares                     | Buyer supplies trade USDC and reviewed allowance to the selected actual exchange. Existing V1 has no execution fee. Approved V2, if deployed/integrated later, adds buyer fee to debit.                                                                                        |
| Selling / market making           | Seller must own outcome shares and grant the actual exchange ERC1155 operator approval after consent. Creating full sets with `split()` requires maker-owned USDC collateral approved to existing Positions; it is not a directional purchase. Posted orders reserve no funds. |
| Winning and VOID principal claims | Backing held by Positions under existing payout rules, not discretionary treasury top-ups. VOID does not guarantee historical purchase-price refunds for secondary buyers.                                                                                                     |
| Oracle proposals/disputes         | Existing immutable bond is 5 USDC per required bond operation, separate from treasury fee revenue, maker reserves and collateral. Bond-credit recovery is separate.                                                                                                            |
| Chain transactions                | A working Base gas payment arrangement: ETH in the submitting account or valid sponsorship. No fixed USD gas estimate is justified without transaction-specific simulation.                                                                                                    |
| VOID execution-fee refunds        | V2 fee escrow paid to original buyer, separate from share principal. Do not send irrevocable fees immediately to treasury and promise unfunded refunds.                                                                                                                        |
| Rewards                           | Disclosed funded sponsor pool or genuinely released/owned fees, not refundable escrow, collateral, Oracle bonds, or the locked promotional credit.                                                                                                                             |

There is no justified universal "$100/$500 treasury minimum." Market-maker capital and inventory depend on actual executable order sizes/prices, exposure limits, desired depth, allowances, gas and risk budget. A funded treasury is neither proof of collateral backing nor authorization to trade.

## New source-only diagnostic component

`protocol/scripts/fee-v2-accounting.mjs` provides pure read-only helpers with canonical decimal-string inputs and BigInt arithmetic. It makes no network calls and does not load credentials, sign, submit, persist or activate anything.

- Require `collected = refunded + released + escrow`.
- Require V2 USDC balance to cover remaining fee escrow.
- Report `balance - escrow` as **unattributed**, never automatically withdrawable surplus. The reviewed V2 has no arbitrary sweep.
- Cumulative released fees are **not** the current treasury balance or available reward budget.
- Model actual `VOID` payer fee rights separately from principal; already-refunded amount cannot be returned again by the diagnostic.
- Allow terminal fee release diagnostics only for actual `RESOLVED`, not `SETTLED`/`CANCELLED`, resolving, timed out-but-not-VOID or an invented transition. Actual contract guards remain authoritative.
- Reject malformed financial numbers, inconsistent release/refund state and uncovered refunds.
- Every result explicitly says `executionAuthorized:false` and `chainEvidenceVerifiedByThisHelper:false`.

The helper **cannot prove inputs are on-chain truth**, all markets/payers have been included, or a transfer is safe/authorized. A future verified reader must obtain code-verified dependency/counter/balance reads at one canonical finalized block and reconcile exact fee events/transfers. These helpers are not wired into production indexer, DB, order submission, user balances or withdrawals, and are not an on-chain enforcement substitute.

## Fresh tests

`npm --prefix protocol run test:fee-accounting`: **8/8 pass**. Covers $10 trade/$0.10 fee escrow, no donation sweep, conservation/deficit rejection, uint256/canonical-string boundaries and values beyond JS safe integer range, nonterminal guards, actual VOID original-payer rights, no duplicate terminal release and inconsistent-state rejection. These are diagnostic unit tests, **not fresh Solidity/EVM or wallet E2E results**. The suite is included in the existing no-secrets protocol test command for future CI.

## Still blocked before launch

See [Stage 4](APPROVED_SECRET_AND_SCHEMA_STAGE4.md). Production RLS/ACL/atomic guard proposals remain unapplied; unmatched function/migration provenance and current public/client orderbook compatibility remain unresolved. Historical canonical receipt reconciliation/catch-up is not complete. V2 versioned schema, full backend/indexer/frontend integration, independent review and approved testnet wallet E2E remain incomplete. Sports secret conversion is done, but authenticated provider health/quota/coverage is not yet verified. No blanket approval is inferred for production writes, deployment, funds or unpause.
