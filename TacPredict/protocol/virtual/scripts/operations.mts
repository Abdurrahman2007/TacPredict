// Dormant operator command. Never signs, funds, deploys, publishes or changes chain state.
// Run from TacPredict/ with the existing server-only test environment.
const mode = process.argv[2] ?? "health";
if (!["health", "index"].includes(mode)) throw Error("Usage: operations.mts health|index");
try {
  if (mode === "index") {
    if (process.env["VIRTUAL_OPS_INDEX_APPROVED"] !== "true")
      throw Error("Indexing requires explicit database-write approval");
    const { runVirtualIndexer } = await import("../../../src/lib/virtual/indexer.server.ts");
    console.log(JSON.stringify({ job: "virtual-indexer", result: await runVirtualIndexer(16) }));
  } else {
    const { virtualOperations } = await import("../../../src/lib/virtual/operations.server.ts");
    const r = await virtualOperations();
    console.log(
      JSON.stringify({
        job: "virtual-health",
        chainId: r.deployment.chainId,
        engine: r.deployment.engine,
        checkpoint: r.checkpoint,
        finalized: r.finalized,
        observedBlock: r.observedBlock,
        ...r.health,
      }),
    );
    if (!r.health.healthy) process.exitCode = 2;
  }
} catch {
  // Do not log RPC URLs, tokens, raw provider errors, wallet data or environment values.
  console.error(
    JSON.stringify({
      job: "virtual-operations",
      status: "FAILED",
      code: "CONFIG_RPC_DATABASE_OR_RECONCILIATION_ERROR",
    }),
  );
  process.exitCode = 1;
}
