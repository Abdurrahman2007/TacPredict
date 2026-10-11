# Base Mainnet deployment approval — prepared, not submitted

- Network: Base Mainnet, chain 8453. Public markets remain Mainnet-only.
- User-confirmed on-chain administrator: `0x57828f1aa32fd6be3988f240068df53ed94b7aef` (Base Account).
- Existing native USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- Six contracts: Registry, Oracle, Factory, Positions, Exchange, Settlement. USDC is not redeployed.
- Nine atomic Base Account calls prepared: six deterministic deployments, Registry FACTORY_ROLE / ORACLE_ROLE grants, then `pauseTrading(true)`.
- The public deterministic deployment proxy at `0x4e59b44847b379578588920cA78FbF26c0B4956C` was checked against its exact published minimal CREATE2 runtime on Base. This is a target-address deployment mechanism; the MCP does not expose bare CREATE.
- Constructors explicitly assign the confirmed admin, not the proxy. Salts/init-code hashes and predicted addresses are retained in the private operator workspace plan, not registered as real deployments.
- Initial Oracle parameters in the prepared batch are 5 USDC bond and 86,400-second challenge period. These must be reviewed before signing; constructor settings are not casually adjustable afterwards.
- A read-only simulation of the full smart-account `executeBatch` passed. Estimated execution gas was 7,856,243; execution-only estimate at the observed gas price was 0.000047137458 ETH. Base L1 data fees and account-abstraction overhead are additional. Estimates are not guarantees or a payment quote.
- The observed account ETH balance was below even that execution-only estimate. No approval request or transaction was submitted; fund gas and review the actual Base Account approval fee first.
- Deployment is not activation: trading remains paused and database `verified` / `trading_enabled` remain false until actual finalized deployment, source/runtime/role checks, independent review and an explicit launch decision.
- Sixteen isolated contract scenarios pass, but these are not an independent audit or exhaustive fuzzing. Real funded Mainnet trading/settlement/claim E2E has not run.
- App `/admin` access is separate from on-chain roles. The owner's login email is still needed; no account has been self-promoted.

Next: review immutable Oracle parameters, ensure an appropriate gas balance, request Base Account approval, poll actual completion, verify finalized receipts and deployment evidence, then configure indexing/operations and separately review launch readiness. No production market or financial event should be fabricated while waiting.
