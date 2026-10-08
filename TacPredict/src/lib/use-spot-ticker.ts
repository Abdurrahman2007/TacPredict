import { useQuery } from "@tanstack/react-query";
import { cryptoMarketQueryOptions } from "@/lib/market-data.functions";
// Shared query state survives page navigation; no per-page WebSocket or reset.
export function useSpotTicker() {
  const { data } = useQuery(cryptoMarketQueryOptions);
  return { ticks: data?.histories ?? {}, live: Boolean(data && !data.stale) };
}
