# Phase 2 — threat model, security invariants and residual risks

**UV design review only; not a smart-contract audit or production safety certification.** Source boundaries marked SV are from the audited repository. Every proposed mitigation still needs implementation, adversarial tests and independent review. No mainnet activation is authorized.

## Assets and trust boundaries

Protected assets: nonwithdrawable virtual cash; share ownership/basis; fair market resolution; scarce grant/seed/sponsorship budgets; points integrity; user privacy; availability; the complete isolation of existing real-USDC balances/contracts. Virtual credits have no redemption value, but manipulating them can corrupt future rewards and consume real ETH gas sponsorship.

Trust boundaries: user browser -> authenticated API; wallet -> engine; eligibility signer -> grant; registry -> engine; resolver -> final payout; RPC -> verifier; verifier -> database projection; admin login -> separate onchain role; rewards draft -> approved snapshot; sponsor queue -> relayer/paymaster. Wallet address count is not person count. Published rules, the eligibility authority, adjudicator and any relayer are material centralization/trust assumptions, not decentralization claims.

## Threat register

| ID / severity | Attack or failure | Proposed control / residual risk |
|---|---|---|
| T01 Critical | Virtual flow accidentally calls real Exchange/USDC/Positions/Pool | Separate engine, ABI, query namespaces and explicit discriminant; no token/callback/external executor; static import tests plus real-token balance invariants. UI cannot route by fallback from missing virtual config. |
| T02 Critical | Arbitrary admin credits or seed-to-wallet conversion | Fixed 500 grant; lifetime claimed + nullifier; immutable issuance hard caps/templates; no setter/withdraw/transfer; seeds only locked market collateral, protocol payouts retired. Governance can still approve bad future policy; no existing-market override. |
| T03 High | Multiwallet grant/referral/sponsor farming | Approved identity/allowlist policy, one-use identity nullifiers where legally appropriate, per-identity review, immutable campaign cap and sponsor quotas. No technical claim of perfect Sybil detection. |
| T04 Critical | Two successful trades in one wallet multicall / ERC-4337 bundle | One canonical engine + never-cleared transient transaction latch on every trade entrypoint; exact one TradeExecuted receipt verifier. Separate engine addresses bypass independent latches: no parallel active engines without shared guard review. |
| T05 Critical | Replay or altered relay amount/outcome/wallet | Domain-separated full EIP-712 intent, same direct/relay wallet nonce, deadline, exact wallet ownership, restricted ERC-1271 static check. No arbitrary target/calldata/value. Cross-chain/engine/version tests. |
| T06 Critical | Rounding, overflow, negative reserve or balance, oversell | Integer units, positive reserve floors, checked 64/128-bit bounds and 256-bit intermediates, conservative buy ceil / maximal safe sell, exact basis closing residual. Mathematical properties + fuzz + independent review; 1,200 scratch cases are not proof. |
| T07 High | Sandwich, stale quote, price pumping, front-running | Explicit min output/deadline, optional strict revision, max size/exposure, bounded liquidity and source policy. Public mempool MEV and strict-revision gas griefing remain; private routing is not guaranteed. |
| T08 High | Finite pool exit unavailable | Quote max executable input, floor/depth reason, all-or-revert, no guaranteed liquidity. Never substitute an offchain fill or silently partial-fill. Terminal payout rule remains available after finality. |
| T09 High | Drain approved virtual seeds through informed/colluding wallets | Finite per-market/campaign exposure, no top-ups, approved eligibility/limits, monitoring. Nontransferable credits still allow economic value transfer through manipulated prices; not preventable merely by deleting transfer(). |
| T10 High | Manufacture points from churn / selective profitable partial sells | Net losses before clamp; completed-episode or resolved-market holdback; flag rapid offsetting/linked wallets; risk-qualified volume and caps pending approval. Never award max(each positive trade PnL,0). Carry losses/holdbacks across cutoff consistently. |
| T11 Critical | Forged success hash, wrong engine event, successful outer tx but failed UserOp | Receipt.status, canonical block, trusted engine, intended wallet/nonce/input, exactly one TradeExecuted. API/signature/UserOp ID alone not success. Buffer whole receipt; invalid proof cannot create a position. |
| T12 Critical | Duplicate logs, race checkpoints, deep reorg | Unique event/transaction/action keys, fenced leases, atomic projection/checkpoint update, provisional undo journal and canonical replay. Finalized mismatch halts and blocks snapshots; privileged repair is auditable and not synthetic trading. |
| T13 High | Oracle/data provider error or malicious resolver | Frozen timestamp/tie/abandonment rules, evidence hashes and independent challenge/adjudication, finalization window. Source/API/AI cannot auto-finalize. Irrevocable wrong final outcome cannot be “fixed” after claims without new approved remediation. |
| T14 High | Challenge spam or unavailable adjudicator locks balances | Precommitted first-challenge deadline, no repeated extensions, defined timeout-to-void. Permissionless no-bond challenge can grief; watcher roles or virtual bond model need approval and centralization disclosure. |
| T15 High | Admin login bypasses contract authority | AAL2 + RBAC + separate onchain role wallet, multisig for sensitive permissions, no hidden bypass; trading pause cannot seize cash/change final results. Compromised governance remains a trust risk. |
| T16 High | Sponsor drains real ETH / queue duplicates / retry after unknown broadcast | Restricted selectors and chain/target, atomic budget reservations, per-wallet/global quotas, real fee reconciliation, nonce-aware idempotent send, emergency sponsor off. Never expose/log key, never auto-pay user gas without confirmation. |
| T17 High | Smart-account holdings assigned to owner EOA on fallback | Economic-wallet identity fixed; direct call must execute from same account or show unsupported/no execution. Grant proofs and points do not auto-merge different addresses. |
| T18 High | RLS leak or client changes balances/points | Additive virtual tables, owner policies, public whitelisted views, privileged narrow RPC, verified auth mapping; adversarial RLS tests. Database service role is powerful; use secret isolation, audit and least privilege. |
| T19 Medium | Misleading probabilities / stale marks / false zero | Distinguish spot reference, marginal AMM estimate, avg execution and executable liquidation. Display canonical block/freshness; error != zero; initial equal priors not “verified odds.” Existing design preserved but real-USDC copy must change for virtual. |
| T20 High | Build target does not enforce transaction latch | Separate Cancun-compatible virtual toolchain; old Shanghai artifacts untouched. Actual Base/testnet support and malicious batching tests are deployment gates. Existing Ganache 7.9.2 harness is not accepted as evidence of EIP-1153 support. |
| T21 High | Dependency/toolchain compromise or unrelated existing vulnerabilities | Pin versions, isolate artifacts, scan dependencies, attest bytecode/manifest, independent review. Phase 1 baseline advisory/lint issues remain; do not claim Phase 2 fixes them. |
| T22 High | Reward snapshot changes after trading or duplicate distribution | Future-only approved formula/config digest; immutable history; unique allocation/publication IDs; independent approve/recompute and documented exclusion appeal. DB admin can tamper without external anchoring; no fake onchain guarantee. |

## Invariants to turn into executable tests after approval

1. No execution path can transfer/approve real ERC20/1155 or invoke one of the old six/Pool contracts. No virtual redeem/transfer/withdraw ABI exists; accidental ETH/token deposits confer no virtual credit or operator withdrawal right.
2. Exactly 500e6 grant once per lifetime wallet; accepted eligibility nullifier cannot be reused for another wallet. Grants/seeds never count as trading PnL or volume.
3. Cash and quantity never negative; basis is consumed exactly once; a full close removes every residual basis atom.
4. Pre-terminal complete-set conservation holds for every outcome. Every transition preserves the cash issuance equation and product does not decrease under integer rounding.
5. Each successful trade has one economic wallet, one consumed nonce, one authoritative trade event and one distinct L2 hash; no two engine trades can succeed in one transaction.
6. No trade past close, after final result, against stale revision where strict mode applies, below min output or beyond approved inventory limits.
7. Seed/fee/model/terms immutable once activated. No cosmetic metadata update changes rules by reference to mutable content.
8. Final result cannot change after finality; settlement credits only owner, at most once. Pool payouts never become spendable admin cash; cross-owner void dust cannot mint value.
9. Failed/reverted/reorged transactions never become finalized positions, volume or points. Provisional state is identifiable and reversible.
10. Same finalized input digest + formula/config/exclusion version produces identical monthly allocations. Negative/open-episode holdback cannot be evaded by selective sells/claims/cutoff timing.
11. Relay cannot alter the signed request; sponsored and direct duplicates cannot both execute, although a duplicate reverted transaction can burn gas.
12. App-admin login cannot sign as resolver, publisher, engine guardian or multisig. Every sensitive operation has distinct app approval and actual chain evidence where required.

## Unresolved blockers, not hidden assumptions

- Eligibility/personhood and privacy policy; approved finite seed/grant risk budget; fee, size, depth, exposure and slippage parameters.
- Initial priors and N=2/3 scope; price display is a finite AMM model, not objectively fair external odds.
- Resolver sources/coverage, challenge/adjudication/timeout-to-void governance; crypto equality and sports finality semantics.
- Points episode/loss-carry method, volume definition, weights/normalization/caps/minimum activity, reward budget and publication authority.
- Actual provider transaction isolation, sender identity and current full gas estimates; sponsorship budget/funding are not set.
- Cancun toolchain/local-fork/testnet checks; official Base RPC probe was blocked (403). No fresh live runtime verification or gas measurement exists.
- Visual layout preservation is feasible; semantic-only virtual copy/data/execution changes require approval. A backend-only swap would retain misleading real-USDC approvals and limit-order behavior [SV].

## Review conclusion

Recommend proceeding to a **local-only implementation only after explicit decisions/approval**. There is no security basis to activate live trading now. Independent contract review and adversarial E2E/role/RLS/receipt tests are later deployment gates. No promise of fair prices, unlimited sell liquidity, Sybil prevention, free gas, token rewards or withdrawable virtual profits.
