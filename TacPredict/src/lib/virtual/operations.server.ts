import { virtualRuntime } from "./runtime.server";
import { checkpoint } from "./database.server";
import { virtualAmmAbi } from "./abi";
import { evaluateVirtualHealth } from "./health";
export async function virtualOperations() {
  const { deployment, client, maxProjectionAgeSeconds } = await virtualRuntime();
  const c = await checkpoint(deployment.id);
  if (c.number < c.start) throw Error("Virtual deployment not yet indexed");
  const [b, indexed] = await Promise.all([
    client.getBlock({ blockTag: "latest" }),
    client.getBlock({ blockNumber: c.number }),
  ]);
  if (indexed.hash.toLowerCase() !== c.hash?.toLowerCase())
    throw Error("Virtual checkpoint needs reorg reconciliation");
  const values: Record<string, string> = {};
  for (const name of [
    "seeded",
    "granted",
    "totalCash",
    "lockedCollateral",
    "feeSink",
    "protocolSink",
    "seedBudget",
    "grantBudget",
    "poolCount",
    "campaignCount",
  ] as const)
    values[name] = String(
      await client.readContract({
        address: deployment.engine,
        abi: virtualAmmAbi,
        functionName: name,
        blockNumber: b.number,
      }),
    );
  const paused = await client.readContract({
    address: deployment.engine,
    abi: virtualAmmAbi,
    functionName: "tradingPaused",
    blockNumber: b.number,
  });
  const health = evaluateVirtualHealth({
    observedAt: BigInt(Math.floor(Date.now() / 1000)),
    checkpoint: c.number,
    head: b.number,
    indexedAt: indexed.timestamp,
    headAt: b.timestamp,
    finalized: c.finalized,
    maxAgeSeconds: maxProjectionAgeSeconds,
    paused,
    seeded: BigInt(values["seeded"]!),
    granted: BigInt(values["granted"]!),
    cash: BigInt(values["totalCash"]!),
    locked: BigInt(values["lockedCollateral"]!),
    fees: BigInt(values["feeSink"]!),
    retired: BigInt(values["protocolSink"]!),
  });
  return {
    configured: true as const,
    deployment,
    values,
    checkpoint: c.number.toString(),
    finalized: c.finalized.toString(),
    observedBlock: b.number.toString(),
    health,
  };
}
