# Approved private Base Sepolia test — preparation only

The user approved admin `0x57828f1aa32fd6be3988f240068df53ed94b7aef`, a single 10,000 Virtual USDC test pool, 100 Virtual USDC private test allocation to that wallet, and maximum cumulative gas expenditure of 0.01 **Sepolia** ETH. This does not authorize Mainnet/production changes or a public campaign.

- Chain: 84532. Seed cap: 10,000,000,000 atoms. Grant cap: 100,000,000 atoms (six decimals).
- Starting state remains no pool, no campaign, no user grants, no creator/resolver/guardian roles. No deployment yet.
- `unsigned-deployment.json` is raw EOA contract-creation data. No recipient/`to` field: do not paste this into a token transfer or send it to an arbitrary address/factory.
- Created with unchanged reviewed `prepare-testnet.mjs`. Constructor sets the approved administrator explicitly.
- Public RPC simulation uses a **simulated balance override** solely for gas estimation. It does not fund the wallet or broadcast a transaction.
- Observed wallet balance: 0 Base Sepolia ETH. Observed deployment gas estimate: 3,573,309. Estimate is not a fixed gas fee; Base L1 fees and future gas prices are additional.
- The connected Base Account matches the approved address. Available `send_calls` requires a target address and cannot express this raw contract creation. No factory workaround, alternate deployer or key access has been used. Owner must sign using a compatible contract-deployment wallet flow; verify resulting sender, constructor and successful creation receipt.
- Get free test ETH using an officially listed faucet: https://docs.base.org/get-started/get-funds or https://portal.cdp.coinbase.com/products/faucet . Select **Base Sepolia**, never Mainnet or real USDC. No paid funding request was made.

After funding/signing: re-estimate total fees, enforce the remaining 0.01 test-ETH cap, verify deployment against exact source/constructor/runtime, and record the creation transaction/address. Only then prepare private roles, a one-wallet 100 Virtual USDC Merkle allocation, frozen test pool terms, individually submitted Buy/Sell receipts and reconciliation checks. Market source/rules/timestamps must be explicit before pool creation; no fabricated live fixture/result.

Do not apply production migrations, change old six contracts, merge to main, modify production environment/secrets, activate public trading, or claim this is deployed/live. Isolated staging DB writes still need their own permission.
