import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { cryptoMarketQueryOptions } from "@/lib/market-data.functions";
import { useSpotTicker } from "@/lib/use-spot-ticker";
import { MarketSparkline } from "@/components/market-sparkline";
export function CryptoDetailChart({ asset }: { asset: "bitcoin" | "ethereum" | "solana" }) {
  const { data } = useQuery(cryptoMarketQueryOptions);
  const { ticks } = useSpotTicker();
  const [minutes, setMinutes] = useState(15);
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
      <div className="mt-5 flex gap-2">
        {[5, 15, 60].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setMinutes(n)}
            aria-pressed={minutes === n}
            className={`min-h-11 rounded-full px-4 text-sm ${minutes === n ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}
          >
            {n === 60 ? "1h" : `${n}m`}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-muted-foreground">Spot price</span>
      </div>
    </section>
  );
}
