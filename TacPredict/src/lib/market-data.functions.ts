import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
export type PricePoint = { time: number; price: number };
export type CryptoMarketSnapshot = {
  bitcoin: { price: number; change24h: number; high24h: number; low24h: number; marketCap: number };
  ethereum: { price: number; change24h: number };
  solana: { price: number; change24h: number };
  histories: Record<"bitcoin" | "ethereum" | "solana", PricePoint[]>;
  source: "CoinGecko";
  stale?: boolean;
  updatedAt: string;
};
const CACHE_MS = 60_000;
export const getCryptoMarketSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { coingeckoSnapshot } = await import("./coingecko.server");
  return coingeckoSnapshot();
});
export const cryptoMarketQueryOptions = queryOptions({
  queryKey: ["crypto-market-snapshot", "coingecko-v1"],
  queryFn: () => getCryptoMarketSnapshot(),
  staleTime: CACHE_MS,
  gcTime: 60 * CACHE_MS,
  retry: 1,
  retryDelay: 5_000,
  refetchInterval: CACHE_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
});
