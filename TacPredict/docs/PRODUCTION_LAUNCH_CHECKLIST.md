# Production launch checklist (requires explicit approval per step)

**Do nothing on this list until you approve that step in writing.**  
Draft PR #27 stays draft. Campaigns stay inactive. Six legacy Base Mainnet contracts stay untouched.

1. [ ] You revoke any exposed GitHub PAT in GitHub UI; configure new auth (SSH or `gh auth login`). Never reuse the old token.
2. [ ] Push `feature/live-prediction-pricing-expiry` so PR #27 includes commit `16235c9`+ follow-ups.
3. [ ] Faucet-fund Sepolia admin; deploy VirtualPriceAMM to **84532 only**; set `VIRTUAL_TRADING_CONFIG`.
4. [ ] Sepolia private Buy/Sell/settle/keeper E2E with recorded tx hashes (see `SEPOLIA_E2E_STATUS.md`).
5. [ ] Choose and license a **fast oracle** for short windows; wire + audit; keep XRP off until verified.
6. [ ] Secured ops host: keeper signer adapter, monitoring, balance alerts (`KEEPER_SETUP.md`).
7. [ ] Separate written approval for any **Mainnet** VirtualPriceAMM deploy (not the six legacy contracts).
8. [ ] Separate approval to enable `VIRTUAL_TRADING_CONFIG.enabled` for public users.
9. [ ] Separate approval for monthly campaigns / rewards distribution.
10. [ ] Security review + terms disclosure (gas is real; Virtual USDC non-redeemable).

Stop after Sepolia private validation unless you approve the next gate.
