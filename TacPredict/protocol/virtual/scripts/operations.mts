// Operator CLI: health | index | plan
// plan = unsigned captureStart / proposeFromFeed / finalize calldata (never signs).
const mode = process.argv[2] ?? "health";
if (!["health", "index", "plan"].includes(mode))
  throw Error("Usage: operations.mts health|index|plan");
try {
  if (mode === "index") {
    if (process.env["VIRTUAL_OPS_INDEX_APPROVED"] !== "true")
      throw Error("Indexing requires explicit database-write approval");
    const { runVirtualIndexer } = await import("../../../src/lib/virtual/indexer.server.ts");
    console.log(JSON.stringify({ job: "virtual-indexer", result: await runVirtualIndexer(16) }));
  } else if (mode === "plan") {
    const { planVirtualOperatorActions } = await import(
      "../../../src/lib/virtual/operator.server.ts"
    );
    const r = await planVirtualOperatorActions();
    console.log(
      JSON.stringify({
        job: "virtual-operator-plan",
        deploymentId: r.deploymentId,
        engine: r.engine,
        actions: r.actions.map(({ data: _d, ...rest }) => ({
          ...rest,
          data: _d.slice(0, 10) + "…",
          dataBytes: (_d.length - 2) / 2,
        })),
        fullCalldataInMemoryOnly: true,
      }),
    );
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
  console.error(
    JSON.stringify({
      job: "virtual-operations",
      status: "FAILED",
      code: "CONFIG_RPC_DATABASE_OR_RECONCILIATION_ERROR",
    }),
  );
  process.exitCode = 1;
}
