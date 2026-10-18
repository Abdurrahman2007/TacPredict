import { useQuery } from "@tanstack/react-query";
import { cryptoMarketQueryOptions, cryptoHistoryQueryOptions } from "@/lib/market-data.functions";
import { chartWindow } from "@/lib/updown/chart-window.mjs";
import { MarketSparkline } from "@/components/market-sparkline";
import type { UpDownAsset } from "@/lib/updown/window.mjs";
export function CryptoDetailChart({
  asset,
  initialMinutes = 15,
  startsAt,
  endsAt,
}: {
  asset: UpDownAsset;
  initialMinutes?: number;
  startsAt?: string | undefined;
  endsAt?: string | undefined;
}) {
  const { data } = useQuery(cryptoMarketQueryOptions);
  const { data: history } = useQuery(cryptoHistoryQueryOptions(asset));
  const observations = [...(history ?? []), ...(data?.histories[asset] ?? [])];
  const last = Math.max(0, ...observations.map((p) => p.time));
  const start = Date.parse(startsAt ?? "");
  const end = Date.parse(endsAt ?? "");
  const since = Number.isFinite(start) ? start : last - initialMinutes * 60000;
  const until = Number.isFinite(end) ? end : last;
  return (
    <section className="mt-6" aria-label="Market spot chart">
      <MarketSparkline
        points={chartWindow(observations, since, until)}
        assetLabel={asset}
        sourceLabel="CoinGecko"
      />
      {data?.stale && <p className="mt-3 text-[11px] text-muted-foreground">Delayed data</p>}
    </section>
  );
}
