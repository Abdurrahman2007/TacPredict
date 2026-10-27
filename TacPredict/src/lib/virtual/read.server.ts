import { encodeAbiParameters, keccak256, toHex, type Address } from "viem";
import type { Market } from "@/domain/markets/types";
import { virtualAmmAbi } from "./abi";
import { virtualPriceAmmAbi } from "./price-abi";
import { assertFreshChainTime, assertFreshProjection } from "./guards";
import { virtualRuntime, virtualConfig } from "./runtime.server";
import { checkpoint, walletEvents, marketEvents } from "./database.server";
import { projectWalletEvents } from "./receipt";
import type { VirtualAccount } from "./types";
export function canonicalMetadata(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalMetadata).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonicalMetadata(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function readVirtualCatalogue(): Promise<{
  markets: Market[];
  enabled: boolean;
  deployment: import("./types").VirtualDeployment;
} | null> {
  if (!virtualConfig()) return null;
  const r = await virtualRuntime(),
    c = await checkpoint(r.deployment.id);
  if (c.number < c.start) throw Error("Virtual indexer has not reached deployment");
  const block = await r.client.getBlock({ blockNumber: c.number });
  if (block.hash.toLowerCase() !== c.hash?.toLowerCase())
    throw Error("Virtual projection reorged; indexer reconciliation required");
  const head = await r.client.getBlock({ blockTag: "latest" });
  assertFreshChainTime(
    head.timestamp,
    BigInt(Math.floor(Date.now() / 1000)),
    r.maxProjectionAgeSeconds,
  );
  assertFreshProjection(block.timestamp, head.timestamp, r.maxProjectionAgeSeconds);
  const markets: Market[] = [];
  for (const meta of r.markets) {
    const p = await r.client.readContract({
      address: r.deployment.engine,
      abi: virtualAmmAbi,
      functionName: "pool",
      args: [BigInt(meta.id)],
      blockNumber: c.number,
    });
    if (
      keccak256(toHex(canonicalMetadata(meta))) !== p.terms.rulesHash ||
      meta.outcomes.length !== p.terms.outcomes
    )
      throw Error("Virtual immutable metadata mismatch");
    const weights = meta.outcomes.map((_, i) =>
      p.reserves.slice(0, p.terms.outcomes).reduce((a, v, j) => (j === i ? a : a * v), 1n),
    );
    const sum = weights.reduce((a, v) => a + v, 0n);
    let up: bigint | null = null;
    let pricingKnown = true;
    if (r.deployment.model === "feed-v1") {
      const { assertPricePolicy } = await import("./price-policy.server");
      await assertPricePolicy(r, meta);
      const policy = await r.client.readContract({
        address: r.deployment.engine,
        abi: virtualPriceAmmAbi,
        functionName: "pricePolicies",
        args: [BigInt(meta.id)],
        blockNumber: head.number,
      });
      const getter = virtualPriceAmmAbi.find(
        (a) => a.type === "function" && a.name === "pricePolicies",
      )!;
      if (
        !meta.pricePolicyHash ||
        keccak256(encodeAbiParameters(getter.outputs, policy)) !== meta.pricePolicyHash
      )
        throw Error("Frozen price policy does not match published rules");
      if (!p.final_) {
        if (head.timestamp >= p.terms.closeAt) pricingKnown = false;
        else
          try {
            up = await r.client.readContract({
              address: r.deployment.engine,
              abi: virtualPriceAmmAbi,
              functionName: "probability",
              args: [BigInt(meta.id)],
              blockNumber: head.number,
            });
          } catch {
            pricingKnown = false;
          } // Stale feed/unopened market: never invent an executable price.
      }
    }
    const history = await marketEvents(r.deployment.id, meta.id, c.number);
    if (!history.some((e) => e.name === "PoolCreated"))
      throw Error("Missing indexed virtual market creation");
    const trades = history.filter((e) => e.name === "TradeExecuted");
    const volume = trades.reduce(
      (n, e) => n + BigInt(String(e.args[e.args["isBuy"] ? "input" : "output"])),
      0n,
    );
    const participants = new Set(trades.map((e) => e.wallet)).size;
    markets.push({
      id: `VIRT-${r.deployment.chainId}-${r.deployment.engine.toLowerCase()}-${meta.id}`,
      title: meta.title,
      category: meta.category,
      description: meta.description,
      source: meta.source,
      sourceUrl: meta.sourceUrl,
      resolutionCriteria: meta.rules,
      closesAt: new Date(Number(p.terms.closeAt) * 1000).toISOString(),
      startsAt: new Date(Number(p.terms.openAt) * 1000).toISOString(),
      endsAt: new Date(Number(p.terms.closeAt) * 1000).toISOString(),
      volume: (Number(volume) / 1e6).toLocaleString("en-US"),
      participants,
      outcomes: meta.outcomes.map((label, i) => ({
        id: String(i),
        label,
        probability: p.final_
          ? p.voided
            ? 100 / p.terms.outcomes
            : p.winner === i
              ? 100
              : 0
          : up !== null
            ? Number(i === 0 ? up : 1000000n - up) / 10000
            : pricingKnown
              ? Number((weights[i]! * 1000000n) / sum) / 10000
              : 0,
        probabilityKnown: p.final_ || pricingKnown,
      })),
      virtual: { deployment: r.deployment, onchainId: meta.id },
    });
  }
  return { markets, enabled: r.deployment.enabled, deployment: r.deployment };
}
export async function readVirtualAccount(wallet: Address): Promise<VirtualAccount> {
  const { deployment: d, client } = await virtualRuntime();
  const c = await checkpoint(d.id);
  if (c.number < c.start) throw Error("Virtual projection unavailable");
  const block = await client.getBlock({ blockNumber: c.number });
  if (block.hash.toLowerCase() !== c.hash?.toLowerCase())
    throw Error("Virtual history reorged; retry after reconciliation");
  const events = await walletEvents(d.id, wallet, c.number);
  const projection = projectWalletEvents(events, wallet);
  const actualCash = await client.readContract({
    address: d.engine,
    abi: virtualAmmAbi,
    functionName: "cash",
    args: [wallet],
    blockNumber: c.number,
  });
  if (actualCash !== BigInt(projection.balance))
    throw Error("Virtual balance reconciliation failed");
  let value = 0n,
    unrealized = 0n,
    claimable = 0n,
    realized = 0n;
  const ids = new Set(projection.positions.map((p) => p.marketId));
  for (const id of ids) {
    const pool = await client.readContract({
      address: d.engine,
      abi: virtualAmmAbi,
      functionName: "pool",
      args: [BigInt(id)],
      blockNumber: c.number,
    });
    const mark = await client.readContract({
      address: d.engine,
      abi: virtualAmmAbi,
      functionName: "markValue",
      args: [BigInt(id), wallet],
      blockNumber: c.number,
    });
    value += mark[0];
    unrealized += mark[1];
    claimable += await client.readContract({
      address: d.engine,
      abi: virtualAmmAbi,
      functionName: "claimable",
      args: [BigInt(id), wallet],
      blockNumber: c.number,
    });
    for (let i = 0; i < pool.terms.outcomes; i++) {
      const pos = await client.readContract({
        address: d.engine,
        abi: virtualAmmAbi,
        functionName: "positions",
        args: [BigInt(id), wallet, i],
        blockNumber: c.number,
      });
      const projected = projection.positions.find((p) => p.marketId === id && p.outcome === i);
      if (pos[0] !== BigInt(projected?.shares ?? "0") || pos[1] !== BigInt(projected?.basis ?? "0"))
        throw Error("Virtual position reconciliation failed");
      realized += pos[2];
    }
  }
  if (realized !== BigInt(projection.realizedPnl)) throw Error("Virtual PnL reconciliation failed");
  return {
    ...projection,
    wallet,
    positionValue: value.toString(),
    unrealizedPnl: unrealized.toString(),
    claimable: claimable.toString(),
    blockNumber: c.number.toString(),
    finalizedBlock: c.finalized.toString(),
  };
}
