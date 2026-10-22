/** Fail-closed release assessment. Read-only evidence is not permission to unpause or spend. */
export function assessLaunchReadiness(evidence) {
  const checks = [];
  const add = (id, actual, message) =>
    checks.push({
      id,
      status: actual === true ? "pass" : actual === false ? "blocked" : "unknown",
      message,
    });
  add("base-mainnet", evidence.chainId === 8453, "RPC must report Base Mainnet (8453).");
  add("canonical-snapshot", evidence.canonical, "Read one finalized block and recheck its hash.");
  add(
    "native-usdc",
    evidence.nativeUsdc,
    "Native Base USDC, six decimals, must match Registry collateral.",
  );
  add(
    "runtime-hashes",
    evidence.runtimeMatches,
    "All six runtime hashes must match the reviewed manifest.",
  );
  add(
    "guardian-role",
    evidence.guardian,
    "The reviewed operator must retain the Registry guardian role.",
  );
  add(
    "open-market",
    evidence.hasOpenMarket,
    "At least one existing market must be inside its immutable trading window.",
  );
  add(
    "funded-collateral",
    evidence.hasCollateral,
    "Verified positions collateral must be funded; this is NOT proof of executable liquidity.",
  );
  add(
    "executable-liquidity",
    evidence.executableLiquidity,
    "Genuine signed maker orders, approvals and balances must be simulated, not inferred from total collateral.",
  );
  add(
    "indexer-freshness",
    evidence.indexerFresh,
    "Finalized indexer checkpoint and job success must be checked against this chain snapshot.",
  );
  add(
    "funded-mainnet-e2e",
    evidence.mainnetE2e,
    "A genuine buy/sell → full oracle challenge → resolution → claim/refund E2E must be evidenced.",
  );
  add(
    "independent-review",
    evidence.independentReview,
    "Independent security review and production operational/legal sign-off are not source verification.",
  );
  add(
    "trading-state",
    evidence.unpaused,
    "Global trading pause must be checked on chain; this command never changes it.",
  );
  add(
    "database-activation",
    evidence.databaseEnabled,
    "The production verified deployment flag is separate from the on-chain pause.",
  );
  return { ready: checks.every((c) => c.status === "pass"), checks, writesPerformed: false };
}
