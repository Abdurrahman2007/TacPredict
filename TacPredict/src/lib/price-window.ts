import type { PricePoint } from "./market-data.functions";
// Include one real source sample immediately before the visible window.
// This preserves honest context for CoinGecko's sparse short-window history.
export function sourcePriceWindow(points: PricePoint[], since: number): PricePoint[] {
  const sorted = [
    ...new Map(
      points.filter((p) => Number.isFinite(p.time) && p.price > 0).map((p) => [p.time, p]),
    ).values(),
  ].sort((a, b) => a.time - b.time);
  const predecessor = sorted.filter((p) => p.time < since && p.time >= since - 300_000).at(-1);
  return [...(predecessor ? [predecessor] : []), ...sorted.filter((p) => p.time >= since)];
}
