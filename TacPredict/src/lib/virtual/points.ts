import type { VirtualEvent } from "./types";
export type PointsFormula = {
  version: string;
  month: string;
  volumeWeight: string;
  pnlWeight: string;
  dayWeight: string;
  volumeCap: string;
  pnlCap: string;
  dayCap: number;
  minHoldingSeconds: number;
};
// Inputs MUST be canonical, finalized, complete events with UTC timestamps supplied by the indexer.
// Produces review candidates only. No mint, distribution, implicit reward budget or default weights.
export function pointsCandidate(
  events: (VirtualEvent & { timestamp: number; finalized: boolean })[],
  formula: PointsFormula,
) {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(formula.month) ||
    !formula.version ||
    formula.minHoldingSeconds < 0 ||
    !Number.isInteger(formula.dayCap) ||
    formula.dayCap < 1
  )
    throw Error("Incomplete formula");
  for (const key of ["volumeWeight", "pnlWeight", "dayWeight", "volumeCap", "pnlCap"] as const)
    if (!/^\d+$/.test(formula[key])) throw Error("Invalid formula value");
  if (BigInt(formula.volumeCap) <= 0n || BigInt(formula.pnlCap) <= 0n)
    throw Error("Positive normalization caps required");
  const episodes = new Map<
    string,
    {
      open: Map<number, bigint>;
      volume: bigint;
      pnl: bigint;
      days: Set<string>;
      first: number;
      flags: Set<string>;
    }
  >();
  const seen = new Set<string>();
  const wallets = new Set(events.map((e) => e.wallet).filter(Boolean));
  if (wallets.size > 1) throw Error("Score one wallet at a time");
  let volume = 0n,
    pnl = 0n;
  const days = new Set<string>();
  const flags = new Set<string>();
  for (const e of [...events].sort(
    (a, b) =>
      a.timestamp - b.timestamp ||
      (BigInt(a.blockNumber) < BigInt(b.blockNumber)
        ? -1
        : BigInt(a.blockNumber) > BigInt(b.blockNumber)
          ? 1
          : a.logIndex - b.logIndex),
  )) {
    const key = `${e.txHash}:${e.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!e.finalized || !e.marketId || !["TradeExecuted", "PositionSettled"].includes(e.name))
      continue;
    let ep = episodes.get(e.marketId);
    if (!ep) {
      ep = {
        open: new Map(),
        volume: 0n,
        pnl: 0n,
        days: new Set(),
        first: e.timestamp,
        flags: new Set(),
      };
      episodes.set(e.marketId, ep);
    }
    if (e.name === "TradeExecuted") {
      if (e.args["isBuy"]) ep.volume += BigInt(String(e.args["input"])); // buy-only, risk-increasing gross input candidate
      ep.open.set(Number(e.args["outcome"]), BigInt(String(e.args["remainingShares"])));
      ep.days.add(new Date(e.timestamp * 1000).toISOString().slice(0, 10));
      if (!e.args["isBuy"] && e.timestamp - ep.first < formula.minHoldingSeconds)
        ep.flags.add("rapid-offset");
    } else ep.open.clear();
    ep.pnl += BigInt(String(e.args["realizedPnlDelta"]));
    if ([...ep.open.values()].every((q) => q === 0n)) {
      const month = new Date(e.timestamp * 1000).toISOString().slice(0, 7);
      if (month === formula.month) {
        if (ep.flags.size) {
          pnl += ep.pnl < 0n ? ep.pnl : 0n;
          for (const f of ep.flags) flags.add(f);
        } else {
          volume += ep.volume;
          pnl += ep.pnl;
          for (const d of ep.days) if (d.startsWith(formula.month)) days.add(d);
        }
      }
      episodes.delete(e.marketId);
    }
  }
  if (episodes.size) flags.add("open-episode-deferred");
  // Never clamp each sale individually. Net completed-episode losses before positive score component.
  const scale = 1000000n;
  const normalize = (x: bigint, cap: bigint) => ((x < 0n ? 0n : x > cap ? cap : x) * scale) / cap;
  const score =
    BigInt(formula.volumeWeight) * normalize(volume, BigInt(formula.volumeCap)) +
    BigInt(formula.pnlWeight) * normalize(pnl, BigInt(formula.pnlCap)) +
    (BigInt(formula.dayWeight) * BigInt(Math.min(days.size, formula.dayCap)) * scale) /
      BigInt(formula.dayCap);
  return {
    version: formula.version,
    month: formula.month,
    volume: volume.toString(),
    realizedPnl: pnl.toString(),
    activeDays: days.size,
    score: score.toString(),
    flags: [...flags].sort(),
    reviewOnly: true as const,
  };
}
