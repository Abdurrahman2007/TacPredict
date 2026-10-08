import type { CryptoMarketSnapshot, PricePoint } from "./market-data.functions";
const assets = ["bitcoin", "ethereum", "solana"] as const;
const ttl = 60_000;
let cached: { value: CryptoMarketSnapshot; expires: number } | undefined;
let pending: Promise<CryptoMarketSnapshot> | undefined;
const histories = new Map<string, { points: PricePoint[]; expires: number }>();
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
async function request(path: string) {
  const key = process.env["COINGECKO_DEMO_API_KEY"];
  if (!key) throw new Error("Crypto price provider is not configured.");
  const response = await fetch(`https://api.coingecko.com/api/v3${path}`, {
    headers: { accept: "application/json", "x-cg-demo-api-key": key },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("CoinGecko is temporarily unavailable.");
  return response.json() as Promise<Record<string, unknown>>;
}
async function history(asset: string): Promise<PricePoint[]> {
  const saved = histories.get(asset);
  if (saved && saved.expires > Date.now()) return saved.points;
  try {
    const raw = await request(`/coins/${asset}/market_chart?vs_currency=usd&days=1`);
    const points = Array.isArray(raw["prices"])
      ? raw["prices"]
          .flatMap((row: unknown) => {
            if (!Array.isArray(row)) return [];
            const time = num(row[0]),
              price = num(row[1]);
            return time > Date.now() - 86_400_000 && time <= Date.now() + 5000 && price > 0
              ? [{ time, price }]
              : [];
          })
          .sort((a, b) => a.time - b.time)
      : [];
    if (!points.length) throw new Error("No price history");
    histories.set(asset, { points, expires: Date.now() + 600_000 });
    return points;
  } catch {
    return saved?.points ?? [];
  }
}
async function snapshot(): Promise<CryptoMarketSnapshot> {
  // One request obtains all three current prices. Never expose the key to clients.
  const raw = await request(
    "/simple/price?vs_currencies=usd&ids=bitcoin,ethereum,solana&include_24hr_change=true&include_last_updated_at=true&include_market_cap=true",
  );
  const now = Date.now();
  const rows = await Promise.all(
    assets.map(async (asset) => {
      const item = raw[asset] as Record<string, unknown> | undefined;
      const price = num(item?.["usd"]),
        time = num(item?.["last_updated_at"]) * 1000;
      if (price <= 0 || time <= 0 || time > now + 5000 || now - time > 900_000)
        throw new Error("No recent CoinGecko price.");
      const historical = await history(asset);
      const old = cached?.value.histories[asset] ?? [];
      const points = [
        ...new Map(
          [...historical, ...old, { time, price }]
            .filter((p) => p.time > now - 86_400_000)
            .map((p) => [p.time, p]),
        ).values(),
      ].sort((a, b) => a.time - b.time);
      return {
        asset,
        price,
        time,
        points,
        change24h: num(item?.["usd_24h_change"]),
        marketCap: num(item?.["usd_market_cap"]),
      };
    }),
  );
  return {
    bitcoin: {
      price: rows[0]!.price,
      change24h: rows[0]!.change24h,
      high24h: 0,
      low24h: 0,
      marketCap: rows[0]!.marketCap,
    },
    ethereum: { price: rows[1]!.price, change24h: rows[1]!.change24h },
    solana: { price: rows[2]!.price, change24h: rows[2]!.change24h },
    histories: { bitcoin: rows[0]!.points, ethereum: rows[1]!.points, solana: rows[2]!.points },
    source: "CoinGecko",
    updatedAt: new Date(Math.max(...rows.map((row) => row.time))).toISOString(),
    stale: rows.some((row) => now - row.time > 180_000),
  };
}
async function edgeSnapshot(): Promise<CryptoMarketSnapshot | null> {
  try {
    const edge = (globalThis.caches as unknown as { default?: Cache } | undefined)?.default;
    const response = await edge?.match("https://tacpredict.fun/__cache/coingecko/snapshot-v1");
    if (!response) return null;
    const value = (await response.json()) as CryptoMarketSnapshot;
    return value.source === "CoinGecko" && Date.now() - Date.parse(value.updatedAt) < 900_000
      ? value
      : null;
  } catch {
    return null;
  }
}
async function saveEdge(value: CryptoMarketSnapshot) {
  try {
    const edge = (globalThis.caches as unknown as { default?: Cache } | undefined)?.default;
    await edge?.put(
      "https://tacpredict.fun/__cache/coingecko/snapshot-v1",
      new Response(JSON.stringify(value), {
        headers: { "Content-Type": "application/json", "Cache-Control": "public,max-age=60" },
      }),
    );
  } catch {
    /* In-memory cache remains available in local development. */
  }
}
export async function coingeckoSnapshot(): Promise<CryptoMarketSnapshot> {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pending) return pending;
  pending = (async () => {
    const shared = await edgeSnapshot();
    if (shared) {
      cached = { value: shared, expires: Date.now() + ttl };
      for (const asset of assets)
        if (!histories.has(asset))
          histories.set(asset, { points: shared.histories[asset], expires: Date.now() + 600_000 });
      return shared;
    }
    const value = await snapshot();
    cached = { value, expires: Date.now() + ttl };
    await saveEdge(value);
    return value;
  })()
    .catch(() => {
      if (cached && Date.now() - Date.parse(cached.value.updatedAt) < 900_000) {
        const value = { ...cached.value, stale: true };
        cached = { value, expires: Date.now() + ttl };
        return value;
      }
      throw new Error("Crypto prices are temporarily unavailable. Please try again.");
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
