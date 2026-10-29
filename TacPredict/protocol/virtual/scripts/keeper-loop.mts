/**
 * Scheduled keeper entrypoint (supervisor/cron invokes this).
 *
 * Env:
 *   VIRTUAL_KEEPER_SUBMIT=true  — actually send txs (default: plan/dry-run only)
 *   VIRTUAL_KEEPER_CHAIN_ID     — must be 84532 for submit (Sepolia)
 *   VIRTUAL_RPC_URL             — RPC
 *
 * Never broadcasts on Base Mainnet. Does not invent oracle prices.
 */
import { assertKeeperNetworkAllowed, memoryKeeperStore, runKeeperTick, KEEPER_GAS_POLICY } from "../../../src/lib/virtual/keeper.ts";

const submit = process.env["VIRTUAL_KEEPER_SUBMIT"] === "true";
const chainId = Number(process.env["VIRTUAL_KEEPER_CHAIN_ID"] ?? process.env["VIRTUAL_CHAIN_ID"] ?? "0");

try {
  assertKeeperNetworkAllowed(chainId || 84532, submit);

  const { planVirtualOperatorActions } = await import("../../../src/lib/virtual/operator.server.ts");
  const planned = await planVirtualOperatorActions();
  const store = memoryKeeperStore();

  if (!submit) {
    console.log(
      JSON.stringify({
        job: "virtual-keeper",
        mode: "dry-run",
        chainId: planned.deploymentId,
        engine: planned.engine,
        actions: planned.actions.length,
        gasPolicy: KEEPER_GAS_POLICY,
        note: "Set VIRTUAL_KEEPER_SUBMIT=true on Sepolia only to broadcast",
      }),
    );
    process.exit(0);
  }

  // Submit path intentionally not auto-wired to a private key here — operator must
  // inject a signer adapter in a secured environment. This loop records idempotency only.
  const result = await runKeeperTick({
    store,
    plans: planned.actions.map((a) => ({
      marketId: a.marketId,
      action: a.action,
      idempotencyKey: a.idempotencyKey,
    })),
    execute: async () => {
      throw Error(
        "Signer adapter not configured — dry-run plans only. Wire wallet in secured ops host after approval.",
      );
    },
  });

  console.log(JSON.stringify({ job: "virtual-keeper", mode: "submit-attempt", ...result }));
  if (result.failed) process.exitCode = 2;
} catch (e) {
  console.error(
    JSON.stringify({
      job: "virtual-keeper",
      status: "FAILED",
      error: e instanceof Error ? e.message : "unknown",
    }),
  );
  process.exitCode = 1;
}
