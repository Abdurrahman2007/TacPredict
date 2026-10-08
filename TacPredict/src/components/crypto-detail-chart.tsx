import { useQuery } from "@tanstack/react-query";
import { cryptoMarketQueryOptions } from "@/lib/market-data.functions";
import { sourcePriceWindow } from "@/lib/price-window";
import { MarketSparkline } from "@/components/market-sparkline";
export function CryptoDetailChart({
  asset,
  initialMinutes = 15,
}: {
  asset: "bitcoin" | "ethereum" | "solana";
  initialMinutes?: number;
}) {
  const { data } = useQuery(cryptoMarketQueryOptions);
  const minutes = Math.min(Math.max(initialMinutes, 1), 60);
  const observations = [...(data?.histories[asset] ?? [])].sort((a, b) => a.time - b.time),
    last = observations.at(-1)?.time ?? 0;
  return (
    <section className="mt-6" aria-label="Market spot chart">
      <MarketSparkline
        points={sourcePriceWindow(observations, last - minutes * 60000)}
        assetLabel={asset}
        sourceLabel="CoinGecko"
      />
      <p className="mt-3 text-[11px] text-muted-foreground">
        CoinGecko reference prices · not a settlement oracle.{" "}
        {data?.stale
          ? "Refresh delayed; showing last available data."
          : "Updates about every minute."}
      </p>
    </section>
  );
}
