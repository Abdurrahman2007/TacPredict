# Implementation gates, points, operations and rollback

**UV: proposals only. No deployment or execution authorization.** Read PHASE1_AUDIT.md and ARCHITECTURE_PROPOSAL.md first.

## Gate 0 — business/security decisions before protocol code

1. Approve bounded virtual AMM versus explicit relaxation of CLOB per-side transaction semantics.
2. Define eligibility (wallet != human), reviewed issuer/root control, one grant per identity/wallet and suspension/recovery policy.
3. Approve fixed virtual seed issuance/budget, spread/fee, liquidity caps and inventory behavior. Never arbitrary admin balance edits.
4. Approve outcome/void rules, crypto source products, sports finality sources, challenge period and separate resolver roles.
5. Approve points eligibility/caps/weights/budget and abuse-review policy. Defaults in this document are NOT enabled business rules.
6. Establish Base EVM transient-storage support and a separate new-contract compiler target without touching the six old builds.
7. Verify sponsoring wallet/provider isolation or select secure dedicated relay. Any future real ETH sponsorship funding needs separate approval.

## Monthly TAC Points proposal (version vp-1-draft)

Recorded as nontransferable database points first. No TAC token, redemption promise, mint, or contract distribution. An optional future onchain snapshot hash/Merkle root improves tamper evidence but costs gas and does not prove scoring correctness; no anchor is submitted in this task.

Illustrative candidates, all UNAPPROVED:
- Minimum 5 eligible UTC days, 10 confirmed actions and 3 distinct markets; hold qualifying risk at least 60 seconds or a reviewed source-specific rule.
- Gross displayed volume counts each initiating user execution once. Points volume V counts only qualifying new Buy acquisition cost; a Sell does not add a second volume reward. Grants, settlement credits, seed/rebalance operations and auxiliary position events count zero volume.
- P = realized PnL from qualified lots closed/settled during the month; complete history required. Unrealized PnL shown separately, never awarded. Losses remain visible; negative P gives zero profit subscore, not fabricated zero PnL.
- D = distinct eligible UTC trading days, not API requests or signatures.
- Example caps: Vcap=10,000 virtual units, Pcap=2,000 virtual units, Dcap=20. Not production defaults.

Exact fixed-point sketch (BigInt; Q=1,000,000):
`v = isqrt(floor(min(V,Vcap) * Q^2 / Vcap))`
`p = floor(clamp(P,0,Pcap) * Q / Pcap)`
`d = floor(min(D,Dcap) * Q / Dcap)`
`score = floor((50*v + 30*p + 20*d) / 100)`

50/30/20 weights and caps require explicit approval. They reward learning/activity even when profit is negative; this policy implication must be reviewed, not silently shipped.

An approved monthly integer points budget B is allocated proportionally to eligible scores using floor + largest-remainder allocation; deterministic address-order tie break. If total score=0, allocate zero. No budget is invented here.

Snapshot specification: UTC [month start,next month start), canonical event block timestamps, finalized cutoff block+hash, engine/runtime/model versions, immutable formula hash, code commit, approved budget, input-event digest, exclusion evidence/rules, sorted wallet scores and output digest. Realization after the month ends belongs to the next month; do not backdate it. Publish only after finalized data reconciliation and authorized review. Corrections are append-only superseding versions with reasons, never rewriting historical outputs. Unique month/formula/snapshot/recipient/distribution keys prevent duplicate credits.

### Anti-abuse / limits

Detect exact duplicate events, same-subject/multiwallet patterns, rapid offsetting trades, repeated reciprocal outcomes, source-boundary advantage, low-risk cycling, coordinated price manipulation, suspicious gain transfers and sponsorship farming. AMM removes direct paired-user fills but does NOT eliminate multiwallet manipulation. CLOB creates additional collusive economic-transfer risk even without a transfer API.

Apply documented per-market/day eligible-volume caps, minimum risk time/size and graph/identity review; keep metrics and exclusion reasons auditable. Unreviewed suspicion is not mathematical proof. Preserve an appeal/review window and versioned exclusion policy before final snapshot. Never claim Sybil-proof, wash-proof or nontransferable economic value merely because transfer() is absent.

## Additive database draft PLAN (no SQL executed or created here)

New virtual namespace, never repurpose legacy financial tables:
- virtual_deployments: chain, address, runtime hash, model/compiler versions, activation gate (default disabled).
- virtual_campaigns/eligibility: issuer approval, reviewed subject/nullifier, expiry, proof digest and audit reason; private reads.
- virtual_grants: chain/deployment/wallet unique, grant tx/event, exact amount, canonical status.
- virtual_markets/outcomes/rules: immutable term/source/model hashes and chain publication links.
- virtual_tx_intents/observations: authenticated wallet, nonce, expected action, tx/userOp/call IDs separately, attempt history, receipt/finality/reorg status.
- virtual_events/leases/checkpoints: deployment-scoped unique keys, canonical hashes, fencing, atomic projection RPC.
- virtual_balances/positions/trades/settlements: exact numeric(78,0) amounts, signed PnL, last canonical event; user-owned projections.
- virtual_price_history: pool-derived mark/revision vs external reference clearly distinguished.
- virtual_points_formulas/snapshots/rows/distributions/exclusions: immutable versions, approved budget/digests, unique credit keys.
- virtual_gas_policies/reservations/attempts/receipts and virtual_admin_audit: private, redacted, append-only application writes.

RLS: users read their private identity/eligibility/intents/positions through proven protocol_wallets ownership; public catalogue/prices only explicit safe views; public ranking excludes private subject IDs. No anonymous/authenticated financial writes. New privileged RPCs require service role and fenced event facts; admin queries require assigned admin + AAL2, not editable metadata. Service role has powerful access: append-only tables are not cryptographically immutable against database owner. Optional future signed digests/anchors improve tamper evidence. Live RLS and real Postgres concurrency tests are still unverified.

## Gas sponsorship and user-paid fallback

Priority: capability/provider investigation -> scoped sponsorship -> explicit user-paid transaction -> fail closed. No present provider or zero-gas promise.

- Existing connectors are reusable; no paymaster configuration was found in source execution helpers. ERC-4337 may bundle trades; require actual one-action-per-L2-transaction evidence, not a userOp hash.
- Candidate secure relay: dedicated service signs one fixed engine action per chain transaction; trader signs EIP-712 intent binding deployment, chain, wallet, action, market, outcome, quantity, slippage, nonce and expiry. Verify EOA/ERC1271; no generic forwarder arbitrary calldata. Protect cross-route replay with the same engine nonce for direct and relayed action.
- Relay is a proposal, not a configured signer. Production keys, budget funding, signer/KMS custody and provider terms are unresolved. No key is requested or created during audit.
- Per-wallet/day and global budget, per-action gas/value limits, concurrency-safe reservations, runtime/address/selector allowlist, preflight simulation, abuse controls, redacted monitoring and emergency sponsorship-off switch independent of trading.
- Settle reservation to actual receipt gas (including applicable L1/data fees); account for failures and expired attempts. Do not advertise fixed fees.
- On sponsorship denial before submission, offer user-paid gas estimate + confirmation. On ambiguous submission, reconcile receipt/replacement/nonce first; never blindly repeat as a new action. User rejection never auto-switches into a paid transaction. Same account/intent must be preserved across routes.
- No approved gas route or no successful receipt/event means NO completed trade. No real-USDC approval is necessary in any virtual route.

## Admin screens / permissions

Keep existing design/sidebar approach; add virtual-scoped tabs/sections, not a public prediction redesign.
- Overview: eligible users, grants, active wallets, finalized trades/volume, positions and PnL; pending and estimated metrics separated; virtual labels mandatory.
- Users: wallet search, proof/grant status, chain balance, positions/history/points and suspicious flags. NO setBalance, withdrawal, arbitrary grant amount or mint button. Corrections require a future narrowly defined onchain procedure; no such procedure approved now.
- Markets: preview immutable terms, seed/model limits and sources; authorized publish intent only. Pause trading requires virtual guardian wallet role; admin login cannot bypass chain roles. Old contracts never targeted.
- Resolution: evidence, proposer, challenge deadline, disputes, final result, claim state. Separate proposer and arbiter controls; wallet receipts required.
- Points: future-month approved formula only, preview, exclusions/reasons, reproducible snapshots, separate final approval and unique distribution record.
- Gas: sponsorship cap/reservations/actual gas/failures, independent disable. No secret values.
- Security: assigned admin/AAL2, CSRF/rate limits, least privilege, role/action separation, multisig plan for production, append-only audit + optional tamper-evident digest.

## Threat model and required implementation tests

| Threat | Required invariant / tests before release |
|---|---|
| Duplicate/farmed grants | 500e6 constant, wallet/nullifier uniqueness, unauthorized root/voucher, expiry, replay, concurrency, identity assumptions |
| Real-money crossover | No USDC/ERC20 calls, old contract targets or withdrawal/bridge/transfer ABI; mock real token balances unchanged in complete local lifecycle |
| Batched/reentered trades | One Buy OR Sell per distinct receipt; sequential smart-wallet multicall, relay replay, ERC4337 bundle collision and malicious callbacks |
| Accounting inflation | Fuzz reserve/virtual supply conservation, fees/rounding, zero/huge inputs, partial sells, exhausted inventory, settlement and VOID; no negative cash/shares |
| PnL manipulation | Exact average basis, final-lot remainder, realized/unrealized separation, source/revision staleness and slippage reverts |
| Resolution takeover | Source/time/role checks, challenges, separate arbiter, immutable rules, timeout, duplicate finalization/claim |
| False confirmations/reorg | Missing/wrong event, reverted receipt, wrong chain/runtime, duplicate logs, canonical changes, pending replacements, transaction uniqueness, CAS/checkpoint fences |
| Backend takeover / RLS | Private user isolation, unauthorized admin/service RPC, MFA, verified wallet owner, payload/rate limits, audit and no secret leakage |
| Rewards / Sybil | Negative PnL, reproducibility, UTC cutoff/finality, historical versions, zero scores, exact rounding allocation, wash/offset scenarios, duplicate distribution |
| Gas theft | Budget races, allowed selectors/nonce/domain, malicious calldata, sponsor failure, no automatic paid fallback after rejection, actual gas reconciliation |

Contract scenarios must use a local chain first. Testnet requires separately approved harmless testnet execution if later desired; no mainnet transactions. A full funded real-USDC test is irrelevant to virtual-path approval. Independent security review remains a future release gate.

## Sequenced implementation and release gates

1. Phase 1 (THIS PR): findings, model comparison, design and safety gates only.
2. After design review: isolated virtual contracts + math/property tests; freeze old source/artifact hashes.
3. Additive migration drafts + local Postgres/RLS tests; new scoped indexer and reconciliation; no production migration.
4. Virtual API + receipt-first adapter and minimal labels behind disabled configuration; keep prediction layout unchanged.
5. Admin review screens + candidate points engine + sponsorship mocks; local E2E and adversarial tests.
6. Separate audit/approval for deployment, migrations, actual gas sponsorship funding and activation. This task gives none of those approvals.

## File changes and rollback for this phase

New documentation only: PHASE1_AUDIT.md, ARCHITECTURE_PROPOSAL.md, IMPLEMENTATION_GATES.md, VALIDATION.md and baseline-evidence.json. No implementation files changed. Generated local artifacts are excluded.

Rollback: close the draft PR/delete the review branch, or revert its docs commit if merged later. No database, contracts, permissions, balance or secret rollback is required because none changed. Do not merge to main during this task; main pushes trigger deployment. A future virtual release rollback must disable only the new path, preserve finalized logs/claims, reconcile in-flight transactions and never redirect users into the old real-USDC path.
