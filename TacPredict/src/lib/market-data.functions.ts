import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
export type PricePoint = { time: number; price: number };
export type CryptoMarketSnapshot = {
  bitcoin: { price: number; change24h: number; high24h: number; low24h: number; marketCap: number };
  ethereum: { price: number; change24h: number };
  solana: { price: number; change24h: number };
  histories: Record<"bitcoin" | "ethereum" | "solana", PricePoint[]>;
  source: "Coinbase";
  updatedAt: string;
};
const CACHE_MS = 60_000;
let cached: { value: CryptoMarketSnapshot; expiresAt: number } | undefined;
let pending: Promise<CryptoMarketSnapshot> | undefined;
const numeric = (value: unknown) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
};
async function request(path: string): Promise<unknown> {
  try {
    const response = await fetch(`https://api.exchange.coinbase.com/products/${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
async function snapshot(): Promise<CryptoMarketSnapshot> {
  const products = [
    { asset: "bitcoin", pair: "BTC-USD" },
    { asset: "ethereum", pair: "ETH-USD" },
    { asset: "solana", pair: "SOL-USD" },
  ] as const;
  const now = Date.now();
  const rows = await Promise.all(
    products.map(async (product) => {
      const [rawTicker, candles] = await Promise.all([
        request(`${product.pair}/ticker`),
        request(`${product.pair}/candles?granularity=900`),
      ]);
      const ticker = rawTicker as { price?: unknown } | null;
      const history: PricePoint[] = [];
      if (Array.isArray(candles))
        for (const row of candles) {
          if (!Array.isArray(row)) continue;
          // Closed 15-minute candles only, positioned at their close timestamp.
          const time = (numeric(row[0]) + 900) * 1000,
            price = numeric(row[4]);
          if (time > now - 86400000 && time <= now && price > 0) history.push({ time, price });
        }
      const unique = [...new Map(history.map((p) => [p.time, p])).values()].sort(
        (a, b) => a.time - b.time,
      );
      return { asset: product.asset, price: numeric(ticker?.price), history: unique };
    }),
  );
  const btc = rows[0]!,
    eth = rows[1]!,
    sol = rows[2]!;
  const prices = btc.history.map((p) => p.price);
  return {
    bitcoin: {
      price: btc.price,
      change24h: 0,
      marketCap: 0,
      high24h: prices.length ? Math.max(...prices) : 0,
      low24h: prices.length ? Math.min(...prices) : 0,
    },
    ethereum: { price: eth.price, change24h: 0 },
    solana: { price: sol.price, change24h: 0 },
    histories: { bitcoin: btc.history, ethereum: eth.history, solana: sol.history },
    source: "Coinbase",
    updatedAt: new Date(now).toISOString(),
  };
}
export const getCryptoMarketSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (pending) return pending;
  pending = snapshot()
    .then((value) => {
      cached = { value, expiresAt: Date.now() + CACHE_MS };
      return value;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
});
export const cryptoMarketQueryOptions = queryOptions({
  queryKey: ["crypto-market-snapshot"],
  queryFn: () => getCryptoMarketSnapshot(),
  staleTime: CACHE_MS,
  gcTime: 10 * CACHE_MS,
  retry: 0,
  refetchInterval: CACHE_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
});
