# Phase 2 — decision gates, test plan and evidence status

**Architecture/threat-model review only. No new protocol implementation is authorized by this document.** Start with [AMM/accounting](PHASE2_AMM_SPEC.md), then [interfaces/API/admin/gas](PHASE2_INTERFACES.md), [threat model](PHASE2_THREAT_MODEL.md), and [exact file plan](PHASE2_ADAPTER_AND_FILE_PLAN.md).

## 1. Decisions needing explicit approval

No eligibility rule, seed/liquidity budget, points weight or reward budget has been chosen. Numerical examples are not defaults. “Approve local implementation” is not permission for deployment, migrations, secret/config changes or trading activation.

| ID | Approval required | Recommended option for review / alternatives and trade-offs |
|---|---|---|
| A1 Execution scope | Finite FPMM, 2/3 outcomes; nontransferable internal shares | Recommend FPMM for the strict one-action/one-tx model. CLOB needs a different matching/transaction policy; N>3 needs a new math/gas review. |
| A2 Eligibility | Who receives 500, identity/nullifier policy, lifetime wallet rule, total grant cap, privacy/appeal policy | Pilot allowlist/reviewed wallets limits abuse, but centralizes access. Open wallet signup is easier and highly Sybil-farmable. Stronger person verification adds privacy/vendor cost. **No policy selected.** |
| A3 Liquidity/risk budget | Per-market seed S, total campaign seed cap, active-market cap, position/trade/exposure/depth limits | Small equal-prior pools reduce virtual liability but increase slippage/manipulation and blocked exits; larger pools improve depth and increase seed extraction risk. Finite locked seed only, no admin cash grant/top-up. **All economic values UNSET.** |
| A4 Pricing controls | Equal priors vs reviewed alternative, fee, reserve floors, min size, slippage bounds, strict revision, expiry/cooldown | Recommend equal priors + strict revision initially, with clear simulation disclosure. Fees reduce churn but affect performance; zero fee is simpler but easier to farm. No fee, tolerance, duration or cap chosen. |
| A5 Resolution | Crypto source/timestamps/ties; sports fixture/finality; proposer/watchers/adjudicator; challenge length and dispute timeout | Recommend independent watcher/adjudicator pilot with disclosed centralization. Public no-bond challenges can grief; virtual-bond design needs more review. Short challenge is faster/less robust; 24h is slower/more review time. Existing Oracle's 24h is not automatically adopted. |
| A6 Void rule | Uniform 1/N share payout with cross-owner dust treatment | Recommended conservation-preserving neutral payout; not cost-basis refunds. If cost-basis refunds are required, stop and redesign economics. |
| A7 Points eligibility | Volume definition, completed-episode vs resolved-market PnL holdback, negative PnL/loss carry, minimum days/risk, exclusions/appeal | Recommend completed-episode or resolved-market holdback; partial realized profits alone are exploitable. Buy-only risk-qualified volume is simpler; turnover including sells requires stronger anti-churn controls. **No thresholds selected.** |
| A8 Points weights/budget | Weights/normalization/caps, monthly total points budget, publication authority/cutoff/carry rules | DB ledger recommended first; optional later onchain digest. No TAC token promises. **All weights and reward budgets UNSET.** A month cannot publish with an incomplete config. |
| A9 Gas | Allowed connectors/provider, one-L2-tx isolation, relay acceptance, per-user/global sponsor budgets, same-wallet user-paid consent | Provider isolation first; if unsupported dedicated one-intent/one-tx relay, otherwise direct user-paid call. Relay introduces key/operations risk; smart-account bundles cannot relax the transaction rule. **No provider, funding or limits selected.** |
| A10 UI semantic adapter | Preserve visual design; approve only virtual label/copy, quote/slippage/status and data/execution bindings | Required for truthfulness. Exact unchanged real-USDC approvals/resting-order semantics cannot describe this protocol. No prediction UI redesign. |
| A11 Governance/deployment gates | Multisig roles, pause/resume/settlement access and independent security review | Separate app-admin and contract authority; non-upgradeable pilot recommended. No deploy/activation authority granted now. |

You may approve a **local-only implementation with unresolved economic parameters represented as mandatory unset configuration**. In that case no default eligibility, seed, fee, points formula or budget can be silently supplied, and no production/testnet activation is possible. Any new design assumption outside these documents returns for review.

## 2. Required tests after approval (NOT run as new protocol tests yet)

| Suite | Required assertions / cases |
|---|---|
| Grant/issuance | Exact 500e6; duplicate wallet across campaigns; reused identity nullifier on another wallet; expired/wrong-chain/wrong-engine proof; unauthorized/altered amount; campaign cap; concurrent claims; no arbitrary admin credit |
| Asset isolation | No ERC20 transfer/approval or ERC1155 redemption; balances of real token/mock assets unchanged through grant/Buy/Sell/settle; no deposit/withdraw/bridge/transfer function; referral rewards never auto-credit |
| AMM math | 2/3 outcomes, equal reserves and imbalanced states, exact rational reference, ceil/floor boundaries, 1 atom/min-size/max bounds, overflow/casts, zero input/output, fees, conservation/product properties; random sequences and adversarial invariant fuzzing |
| Buy/Sell | Distinct successful transactions; exact gross buy/net sell accounting, invalid outcome, insufficient cash/shares, partial close, full close residual basis, minimum outputs, stale revision/deadline, reserve floors/max exposure, all-or-revert liquidity failure |
| Transaction isolation | Buy+Buy/Buy+Sell/Sell+Sell through smart-wallet multicall, different wallets/markets, sequential relay calls, malicious ERC-1271 callback and ERC-4337 bundle; at most one trade event per receipt; new tx resets latch; no outer receipt success misattribution |
| Replay/relay | Direct vs relay same nonce race, altered signature/fields/domain/chain, expired intent, owner-EOA vs smart-account mismatch, arbitrary calldata/ETH/target forbidden; unknown broadcast reconciled before retry |
| Time/status | Open/close exact boundary, clock transitions without scheduler, paused trading/resume role, no trading after final, trading-only pause does not confiscate/disable final owner payout |
| Resolution | Source evidence and timestamp/tie/abandonment rules; proposal too early; challenge boundaries; repeated challenge cannot extend; wrong proposer/adjudicator; disputed timeout; no result alteration after final |
| Settlement/void | Winning/losing positions, multiple outcomes, cost-basis netting, settleFor pays owner only, duplicate/replay claim, no pool payout to admin; uniform void payout and multi-owner fractional dust reconciliation |
| PnL | Weighted average basis including fees, partial sell rounding, all-outcome net results, marginal vs liquidation value, no grant/seed profit, self-buy/partial-positive-realization exploit and deferred loss, no unsupported zero on error |
| Indexer | Receipt status/log address/intent match, no event/multiple trade events/wrong wallet/wrong chain, forged hash, failed UserOp inside successful outer tx, duplicate logs, reordered logs, provisional reorg, finalized checkpoint mismatch halt, lease race, gap and reconciliation failure |
| Points | Same digest reproduces snapshot; negative net PnL before clamp; open episode/losing-outcome deferral, month boundary/loss carry/late settlement, wash/churn/linked-wallet exclusions, min days, zero denominator, rounding remainder, immutable versions, unset config blocks publication, duplicate allocation/publication |
| Sponsorship | Per-wallet/global budget race, malicious selector/engine/gas request, maximum reservation, real-cost reconciliation, disabled sponsor direct fallback, estimate failure, no native ETH -> no trade, no duplicate direct+sponsored fill |
| Admin/RLS | Each permission individually; app admin cannot bypass chain role; user A cannot mutate/read protected B data; anonymous no writes; private eligibility evidence not public; audit preserved; scoped public views; no balance editor |
| UI regression | Same prediction layout/CSS/screenshots at mobile/desktop; explicit Virtual USDC and nonredemption copy; no real approval/orderbook branch, market catalogue separation, pending/finalized/reverted/reorged states; real-market regression tests |
| Operational | Separate compiler/artifacts; six source/manifest hashes unchanged; safe disabled defaults; no real address substitution; local typecheck/lint/build/dependency review; no production worker scheduled side effects |

Local-chain time travel may test challenge windows; it cannot substantiate actual testnet elapsed waiting. An unavailable harness, RPC, local Supabase or provider is reported **NOT RUN / BLOCKED**, never “passed.”

## 3. Future testnet plan — approval required before any deployment

**Now:** plan only, no deployment, signing, funding, migration or provider configuration.

1. Approve local implementation and selected decision values (or explicitly keep them unset). Implement only the exact allowlist, use disposable local chain and database, run the suites above and publish reproducible results. Preserve old contracts/build outputs with hashes.
2. Verify a Cancun/EIP-1153-capable local harness and pinned compiler; existing Shanghai/Ganache setup alone is not accepted for transaction-latch proof. Locally test malicious batches and receipt verification before any remote-chain step.
3. Produce an unsigned Base Sepolia (`84532`) plan with separate new contracts/roles, immutable dependencies/terms, small **approved test-only** seed/grant cap, virtual labels, bytecode hashes and a test-only deployment namespace. Do not reuse six mainnet addresses. An unsigned plan is not a deployment.
4. Request separate explicit permission for testnet transactions and any test-only account/secret/provider setup. User supplies approved test wallets/roles; never ask for seed phrases/private keys in chat. Funding is test ETH only; no real-USDC approval/deposit. Do not create/change production secrets or configuration.
5. After that permission only: deploy new test contracts, verify code/roles/chain and one-time bootstrap; record actual addresses/hashes. Initialize only approved test markets. Keep old six untouched on every chain.
6. Two approved test wallets receive grants under the test eligibility rule. Record Buy and Sell in **separate successful L2 transaction hashes**; validate one TradeExecuted per whole receipt, state conservation, partial sales, bad quotes and all exceptional paths.
7. Test provider isolation and dedicated relay/direct fallback with actual receipts and full cost estimates. Show a bundled second trade fails; do not present a successful first UserOp as success of the second. Without a supported provider mark sponsorship BLOCKED, not zero-gas ready.
8. Resolve/void test markets under the actual approved windows and roles. Wait actual testnet challenge intervals; label time-travel results as local only. Reconcile final onchain state with disposable projections and reproduce a sample **nonproduction** points snapshot.
9. Publish testnet evidence, gas distributions by operation, failures, residual threats, source/bytecode hashes and independent review findings. Disable only new test services via approved roles if needed; preserve logs. No automated mainnet continuation.
10. Stop again. Production requires a new approval covering security audit, business rules/budgets, role owners, legal/product disclosures, production migration/config/secrets, new verified contracts, sponsorship funding and activation. None is authorized by the current request.

## 4. Evidence and checks performed in Phase 2

| Item | Classification / result |
|---|---|
| Existing prediction card/detail/routes/admin/compiler inspection | **SV**; native real-USDC/order/approval coupling identified; explicit adapter necessary |
| FPMM reference arithmetic | **LT**; 1,200 deterministic scratch scenarios passed the listed arithmetic assertions; saved JSON includes exact example and limits of evidence |
| New contracts, gas, RLS, adapter or points implementation | **UV / NOT IMPLEMENTED**; no such test pass is claimed |
| EIP-1153 / OP Ecotone / ERC-4337 / ERC-5792 | Specification research; supports reasoning, not deployed runtime/provider verification |
| Official Base RPC read-only probe | **UV / BLOCKED**; HTTP 403 before chain ID; no transaction/deployment, no runtime compatibility assertion |
| Existing six contract preservation | **SV/local file verification**; no protocol source, artifact or manifest changes in this phase |
| Production service/RLS/secrets/provider state | **UV**; not introspected or changed |
| Full old application/contract checks | **Not rerun in Phase 2**; Phase 1 reported 166 tests pass plus compile/typecheck/build; lint had 496 errors/19 warnings and dependency advisories. Historical results are not new virtual protocol validation. |

Onchain wallet activity/balances are publicly observable even if APIs use owner-scoped RLS. Protect private eligibility/identity/account metadata; never promise that an onchain portfolio is private or anonymous.

## 5. Change summary / current stop point

Phase 2 adds only:

```
docs/virtual-usdc/PHASE2_AMM_SPEC.md
docs/virtual-usdc/PHASE2_INTERFACES.md
docs/virtual-usdc/PHASE2_THREAT_MODEL.md
docs/virtual-usdc/PHASE2_ADAPTER_AND_FILE_PLAN.md
docs/virtual-usdc/PHASE2_APPROVALS_AND_TESTNET.md
docs/virtual-usdc/phase2-design-evidence.json
```

AMM math/accounting, interface and service contracts, threat review, UI feasibility and exact implementation allowlist are ready for review. Economic values, eligibility, provider behavior and final resolution/points policies remain unresolved as listed. **Wait for user approval before creating implementation files.** No PR merge or production action.
