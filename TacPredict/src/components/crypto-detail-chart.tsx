import { useQuery } from "@tanstack/react-query";
import { cryptoMarketQueryOptions } from "@/lib/market-data.functions";
import { useSpotTicker } from "@/lib/use-spot-ticker";
import { MarketSparkline } from "@/components/market-sparkline";
export function CryptoDetailChart({
  asset,
  initialMinutes = 15,
}: {
  asset: "bitcoin" | "ethereum" | "solana";
  initialMinutes?: number;
}) {
  const { data } = useQuery(cryptoMarketQueryOptions);
  const { ticks } = useSpotTicker();
  const minutes = Math.min(Math.max(initialMinutes, 1), 60);
  const observations = [...(data?.histories[asset] ?? []), ...(ticks[asset] ?? [])].sort(
      (a, b) => a.time - b.time,
    ),
    last = observations.at(-1)?.time ?? 0;
  return (
    <section className="mt-6" aria-label="Market spot chart">
      <MarketSparkline
        points={observations.filter((p) => p.time >= last - minutes * 60000)}
        assetLabel={asset}
        sourceLabel="Coinbase"
      />
    </section>
  );
}
