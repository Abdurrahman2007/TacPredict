import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
export type PricePoint = { time: number; price: number };
export type CryptoMarketSnapshot = {
  bitcoin: { price: number; change24h: number; high24h: number; low24h: number; marketCap: number };
  ethereum: { price: number; change24h: number };
  solana: { price: number; change24h: number };
  xrp: { price: number; change24h: number };
  bnb: { price: number; change24h: number };
  histories: Record<"bitcoin" | "ethereum" | "solana" | "bnb" | "xrp", PricePoint[]>;
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
  queryKey: ["crypto-market-snapshot", "coingecko-v3"],
  queryFn: () => getCryptoMarketSnapshot(),
  staleTime: CACHE_MS,
  gcTime: 60 * CACHE_MS,
  retry: 1,
  retryDelay: 5_000,
  refetchInterval: CACHE_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
});

export const getCryptoAssetHistory = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => {
    if (
      value !== "bitcoin" &&
      value !== "ethereum" &&
      value !== "solana" &&
      value !== "bnb" &&
      value !== "xrp"
    )
      throw Error("Unsupported crypto asset");
    return value;
  })
  .handler(async ({ data }) => {
    const { coingeckoAssetHistory } = await import("./coingecko.server");
    return coingeckoAssetHistory(data);
  });
export const cryptoHistoryQueryOptions = (
  asset: "bitcoin" | "ethereum" | "solana" | "bnb" | "xrp",
) =>
  queryOptions({
    queryKey: ["crypto-asset-history", "coingecko-v3", asset],
    queryFn: () => getCryptoAssetHistory({ data: asset }),
    staleTime: 600000,
    gcTime: 3600000,
    refetchInterval: 600000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
