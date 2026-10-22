import { ASSETS, granularityFor, type UpDownAsset, type PricePoint } from "./window.mjs";
import { parseReferenceCandles } from "./reference-candles.mjs";

// Reference charts only. The Exchange/oracle evidence path is deliberately unchanged.
const BASE = "https://api.coinbase.com/api/v3/brokerage/market/products";
const GRANULARITY: Record<number, string> = {
  60: "ONE_MINUTE",
  300: "FIVE_MINUTE",
  900: "FIFTEEN_MINUTE",
  3600: "ONE_HOUR",
  21600: "SIX_HOUR",
  86400: "ONE_DAY",
};
const TTL = 20_000;
type Result = Awaited<ReturnType<typeof load>>;
const saved = new Map<string, { expires: number; value: Result }>();
const pending = new Map<string, Promise<Result>>();

async function load(asset: UpDownAsset, minutes: number) {
  const granularity = granularityFor(minutes);
  const end = Math.floor(Date.now() / 1000);
  const query = new URLSearchParams({
    start: String(end - minutes * 60),
    end: String(end),
    granularity: GRANULARITY[granularity]!,
    limit: "350",
  });
  const response = await fetch(`${BASE}/${ASSETS[asset].product}/candles?${query}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Reference candles returned ${response.status}`);
  const fetchedAt = Date.now();
  const candles = parseReferenceCandles(await response.json(), fetchedAt);
  if (!candles.length) throw new Error("No observed reference candles");
  return { asset, candles, trades: [] as PricePoint[], granularity, fetchedAt, source: "Coinbase" };
}

export async function referenceWindowData(asset: UpDownAsset, minutes: number): Promise<Result> {
  const key = `${asset}:${minutes}`;
  const hit = saved.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const running = pending.get(key);
  if (running) return running;
  const next = (async () => {
    const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
    const cacheKey = new Request(`https://tacpredict.fun/__reference-cache/v1/${asset}/${minutes}`);
    if (cache) {
      try {
        const response = await cache.match(cacheKey);
        if (response) {
          const data = (await response.json()) as Result;
          if (Date.now() - data.fetchedAt < TTL && data.candles.length) return data;
        }
      } catch {
        /* Cache is optional, never a reason to fabricate prices. */
      }
    }
    const value = await load(asset, minutes);
    if (cache) {
      try {
        await cache.put(
          cacheKey,
          new Response(JSON.stringify(value), {
            headers: { "content-type": "application/json", "cache-control": "public, max-age=20" },
          }),
        );
      } catch {
        /* A genuine fresh observation remains valid if caching fails. */
      }
    }
    return value;
  })()
    .then((value) => {
      saved.set(key, { expires: Math.min(Date.now() + TTL, value.fetchedAt + TTL), value });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, next);
  return next;
}
