import {
  ASSETS,
  granularityFor,
  type Candle,
  type PricePoint,
  type UpDownAsset,
} from "./window.mjs";

const BASE = "https://api.exchange.coinbase.com";
const SOURCE = "Coinbase";

async function get(path: string): Promise<unknown> {
  const response = await fetch(BASE + path, {
    headers: {
      accept: "application/json",
      "user-agent": "TacPredict/1.0 (https://tacpredict.fun)",
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`Price source returned ${response.status}`);
  return response.json();
}

const saved = new Map<string, { expires: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = saved.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const running = pending.get(key);
  if (running) return running as Promise<T>;
  const next = load()
    .then((value) => {
      saved.set(key, { expires: Date.now() + ttl, value });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, next);
  return next;
}

const num = (value: unknown) => {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : 0;
};

/**
 * Real candles, oldest first. [time(s), low, high, open, close, volume] from Coinbase. Short
 * look-backs use one-minute candles; longer ones use the smallest Coinbase candle size that
 * still fits the 300-candle limit.
 */
async function loadCandles(
  asset: UpDownAsset,
  minutes: number,
  granularity: number,
): Promise<Candle[]> {
  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60000);
  const rows = await get(
    `/products/${ASSETS[asset].product}/candles?granularity=${granularity}&start=${start.toISOString()}&end=${end.toISOString()}`,
  );
  if (!Array.isArray(rows)) throw new Error("Unexpected candle response");
  return rows
    .flatMap((row: unknown): Candle[] => {
      if (!Array.isArray(row)) return [];
      const [time, low, high, open, close] = row.map(num) as [
        number,
        number,
        number,
        number,
        number,
      ];
      return time > 0 && open > 0 && close > 0
        ? [{ time: time * 1000, low, high, open, close }]
        : [];
    })
    .sort((a, b) => a.time - b.time);
}

/** Recent individual trades, oldest first, thinned to at most 400 points. */
async function loadTrades(asset: UpDownAsset): Promise<PricePoint[]> {
  const rows = await get(`/products/${ASSETS[asset].product}/trades?limit=1000`);
  if (!Array.isArray(rows)) throw new Error("Unexpected trade response");
  const points = rows
    .flatMap((row: unknown): PricePoint[] => {
      const r = row as { time?: unknown; price?: unknown };
      const time = typeof r.time === "string" ? Date.parse(r.time) : NaN;
      const price = num(r.price);
      return Number.isFinite(time) && price > 0 ? [{ time, price }] : [];
    })
    .sort((a, b) => a.time - b.time);
  if (points.length <= 400) return points;
  const step = (points.length - 1) / 399;
  return Array.from({ length: 400 }, (_, i) => points[Math.round(i * step)]!);
}

export async function spotWindowData(asset: UpDownAsset, minutes: number) {
  const granularity = granularityFor(minutes);
  const [candles, trades] = await Promise.all([
    cached(`candles:${asset}:${minutes}`, granularity > 60 ? 15000 : 4000, () =>
      loadCandles(asset, minutes, granularity),
    ),
    cached(`trades:${asset}`, 2000, () => loadTrades(asset)).catch(() => [] as PricePoint[]),
  ]);
  return { asset, candles, trades, granularity, fetchedAt: Date.now(), source: SOURCE };
}

export async function spotTickers() {
  const entries = await Promise.all(
    (Object.keys(ASSETS) as UpDownAsset[]).map(async (asset) => {
      try {
        const data = (await cached(`ticker:${asset}`, 2000, () =>
          get(`/products/${ASSETS[asset].product}/ticker`),
        )) as { price?: unknown; time?: unknown };
        const price = num(data.price);
        const time = typeof data.time === "string" ? Date.parse(data.time) : NaN;
        return [
          asset,
          price > 0 &&
          Number.isFinite(time) &&
          time <= Date.now() + 5000 &&
          Date.now() - time <= 15000
            ? { price, time }
            : null,
        ] as const;
      } catch {
        return [asset, null] as const;
      }
    }),
  );
  return {
    prices: Object.fromEntries(entries) as Record<UpDownAsset, PricePoint | null>,
    source: SOURCE,
  };
}
