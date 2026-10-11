# Portfolio / Rewards release

## Scope

Navigation stays Home / Search / Markets / Rewards / Portfolio. Shared dark Home/Market tokens, two-column desktop and one-column mobile, quiet borders, restrained motion, accessible focus and reduced-motion support.

- Portfolio: native Base wallet USDC; unknown balance is an em dash, never a placeholder zero. Funding/withdrawal controls are explicitly launch-pending. Verified-account positions, claimable USDC and finalized buy/sell/redemption activity are separate from wallet funds. No invented total value or P&L.
- Claims: verified deployment and owning wallet/network are required; new-risk trading pause alone never disables redemption.
- Rewards: four verified requirements, next actionable step and independent X linking. 15 USDC is a locked promotional offer until backend qualification records a credit. Never wallet USDC, spendable collateral or withdrawable funds.
- Native reward RPC/migration 0013 is account-scoped, SECURITY DEFINER with explicit grants; RLS restricts credit reads, client credit writes are denied. Anonymous RPC execution is denied. Trusted finalized native Base events only; no legacy points or client-completed tasks.

## Explicit campaign counting rules

1. Verified account (confirmed email/phone or supported verified provider identity).
2. One finalized complete-set collateral contribution >= 5 USDC by a proven account wallet. Repeating sub-threshold funding does not meet this rule. The app has no active funding deployment yet.
3. Four distinct settled USDC buy orders; partial fills count once. Unfilled order submissions, testnet events, self trades and counterparties already linked to the same account do not qualify.
4. Same-account X OAuth identity.

These rules are a launch policy, not a guarantee of Sybil or collusion resistance. Anti-abuse review, campaign funding and published legal terms are required before monetary release. No withdrawal/reward-claim transaction exists.

## Design research / review

Public rendered references reviewed: https://trade.phantom.com/portfolio (balance, asset and activity hierarchy) and https://app.layer3.xyz/activations/wallets-exploration-phantom (step-based quest requirements and actions). Patterns only, no copied brand identity.
User-authorized TwinMind review selected UI labels **Claude Opus 5.5 Thinking** and **GPT-6 Astra Thinking**. These are platform-displayed labels, not independent verification of underlying model versions. Only a public TacPredict specification was submitted. Advice informed design; code and verification were performed in this workspace.

## Validation and launch limits

- TypeScript / scoped ESLint / production build.
- Local 16 contract scenarios + exact atomic-money tests + five reward-display state tests.
- Responsive 320 / 375 / 1200px checks: no horizontal page overflow, no page errors, navigation preserved, signed-out amount unknown, transfer controls disabled, four tasks rendered, disclosure interaction works.
- Supabase migration applied; anonymous execution denied, authenticated credit insertion denied, credit RLS enabled. Rolled-back empty-account RPC test returned no qualification or credit. No production test credits created.
- No verified Base mainnet deployment, audited contracts, funded campaign, live indexer/relayer or full authenticated mainnet end-to-end test. Server-side wallet proof / order admission still need service-role key, trusted Base RPC and verified deployment configuration. Never expose these in the browser or repository.

Once qualified, an immutable account credit remains visible even if X is later unlinked. Current task progress and the previously awarded credit are different facts.
