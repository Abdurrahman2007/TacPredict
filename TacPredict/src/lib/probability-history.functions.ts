import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
export type ProbabilityHistory = {
  series: { label: string; points: { time: number; probability: number }[] }[];
  source: "Polymarket";
  updatedAt: string;
  unavailable?: boolean;
};
const input = z.object({
  marketId: z.string().regex(/^poly-\d+$/),
  interval: z.enum(["1h", "1d", "1w", "1m"]),
});
const cache = new Map<string, { value: ProbabilityHistory; expires: number }>();
const list = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  try {
    const a = JSON.parse(String(v));
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
};
export const getProbabilityHistory = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => input.parse(v))
  .handler(async ({ data }) => {
    const key = `${data.marketId}:${data.interval}`,
      saved = cache.get(key);
    if (saved && saved.expires > Date.now()) return saved.value;
    const empty: ProbabilityHistory = {
      series: [],
      source: "Polymarket",
      updatedAt: new Date().toISOString(),
      unavailable: true,
    };
    try {
      const response = await fetch(
        `https://gamma-api.polymarket.com/markets/${data.marketId.slice(5)}`,
        { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) return empty;
      const market = (await response.json()) as { clobTokenIds?: unknown; outcomes?: unknown };
      const tokens = list(market.clobTokenIds),
        labels = list(market.outcomes);
      if (tokens.length !== labels.length || !tokens.length) return empty;
      const fidelity = { "1h": 1, "1d": 15, "1w": 60, "1m": 360 }[data.interval];
      const series = await Promise.all(
        tokens.slice(0, 3).map(async (token, i) => {
          if (!/^\d+$/.test(token)) return { label: labels[i]!, points: [] };
          try {
            const r = await fetch(
              `https://clob.polymarket.com/prices-history?market=${token}&interval=${data.interval}&fidelity=${fidelity}`,
              { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) },
            );
            if (!r.ok) return { label: labels[i]!, points: [] };
            const body = (await r.json()) as { history?: { t: unknown; p: unknown }[] };
            const points = (body.history ?? [])
              .filter((p) => typeof p.t === "number" && p.t > 0 && typeof p.p === "number")
              .map((p) => ({ time: Number(p.t) * 1000, probability: Number(p.p) * 100 }))
              .filter(
                (p) =>
                  Number.isFinite(p.time) &&
                  p.time <= Date.now() + 5000 &&
                  Number.isFinite(p.probability) &&
                  p.probability >= 0 &&
                  p.probability <= 100,
              );
            return {
              label: labels[i]!,
              points: [...new Map(points.map((p) => [p.time, p])).values()].sort(
                (a, b) => a.time - b.time,
              ),
            };
          } catch {
            return { label: labels[i]!, points: [] };
          }
        }),
      );
      const value: ProbabilityHistory = {
        series,
        source: "Polymarket",
        updatedAt: new Date().toISOString(),
        unavailable: !series.some((s) => s.points.length > 1),
      };
      if (cache.size >= 40) cache.delete(cache.keys().next().value!);
      cache.set(key, { value, expires: Date.now() + 60000 });
      return value;
    } catch {
      return empty;
    }
  });
export const probabilityHistoryOptions = (marketId: string, interval: "1h" | "1d" | "1w" | "1m") =>
  queryOptions({
    queryKey: ["probability-history", marketId, interval],
    queryFn: () => getProbabilityHistory({ data: { marketId, interval } }),
    staleTime: 60000,
    retry: 0,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
