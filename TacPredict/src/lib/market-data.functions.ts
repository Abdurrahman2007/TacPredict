import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
export type PricePoint = { time: number; price: number };
export type CryptoMarketSnapshot = {
  bitcoin: { price: number; change24h: number; high24h: number; low24h: number; marketCap: number };
  ethereum: { price: number; change24h: number };
  solana: { price: number; change24h: number };
  histories: Record<"bitcoin" | "ethereum" | "solana", PricePoint[]>;
  updatedAt: string;
};
const CACHE_MS = 60_000;
let cached: { value: CryptoMarketSnapshot; expiresAt: number } | undefined;
let pending: Promise<CryptoMarketSnapshot> | undefined;
const numeric = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
async function request(path: string) {
  try {
    const key = process.env["COINGECKO_API_KEY"];
    const response = await fetch(`https://api.coingecko.com/api/v3/${path}`, {
      headers: key
        ? { accept: "application/json", "x-cg-demo-api-key": key }
        : { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
async function snapshot(): Promise<CryptoMarketSnapshot> {
  const assets = ["bitcoin", "ethereum", "solana"] as const;
  const [prices, ...charts] = await Promise.all([
    request(
      "simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_market_cap=true&include_24hr_change=true",
    ),
    ...assets.map((asset) => request(`coins/${asset}/market_chart?vs_currency=usd&days=1`)),
  ]);
  const histories = Object.fromEntries(
    assets.map((asset, index) => {
      const rows: unknown = charts[index]?.prices;
      const valid: PricePoint[] = Array.isArray(rows)
        ? rows
            .filter(
              (row): row is [number, number] =>
                Array.isArray(row) &&
                typeof row[0] === "number" &&
                typeof row[1] === "number" &&
                Number.isFinite(row[0]) &&
                Number.isFinite(row[1]) &&
                row[1] > 0,
            )
            .map(([time, price]) => ({ time, price }))
        : [];
      const unique = [...new Map(valid.map((point) => [point.time, point])).values()].sort(
        (a, b) => a.time - b.time,
      );
      return [asset, unique.slice(-300)];
    }),
  ) as CryptoMarketSnapshot["histories"];
  const btc = histories.bitcoin.map((p) => p.price);
  return {
    bitcoin: {
      price: numeric(prices?.bitcoin?.usd),
      change24h: numeric(prices?.bitcoin?.usd_24h_change),
      marketCap: numeric(prices?.bitcoin?.usd_market_cap),
      high24h: btc.length ? Math.max(...btc) : 0,
      low24h: btc.length ? Math.min(...btc) : 0,
    },
    ethereum: {
      price: numeric(prices?.ethereum?.usd),
      change24h: numeric(prices?.ethereum?.usd_24h_change),
    },
    solana: {
      price: numeric(prices?.solana?.usd),
      change24h: numeric(prices?.solana?.usd_24h_change),
    },
    histories,
    updatedAt: new Date().toISOString(),
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
