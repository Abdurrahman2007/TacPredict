import { memo, useMemo } from "react";
import type { PricePoint } from "@/lib/market-data.functions";
import { cn } from "@/lib/utils";
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
export const MarketSparkline = memo(function MarketSparkline({
  points = [],
  assetLabel = "Crypto",
  compact = false,
}: {
  points?: PricePoint[] | undefined;
  assetLabel?: string;
  compact?: boolean;
}) {
  const series = useMemo(
    () =>
      [
        ...new Map(
          points
            .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.price) && p.price > 0)
            .map((p) => [p.time, p]),
        ).values(),
      ].sort((a, b) => a.time - b.time),
    [points],
  );
  if (series.length < 2)
    return (
      <div
        className={cn(
          "grid place-items-center text-sm text-muted-foreground",
          compact ? "h-24" : "h-40",
        )}
      >
        Price history unavailable
      </div>
    );
  const low = Math.min(...series.map((p) => p.price)),
    high = Math.max(...series.map((p) => p.price));
  const floor = low - (high - low) * 0.06,
    range = Math.max(high - low, high * 0.00001) * 1.12;
  const first = series[0]!,
    last = series.at(-1)!;
  const span = last.time - first.time;
  const plotted = series.map((p) => ({
    x: 8 + ((p.time - first.time) / span) * 304,
    y: 8 + (1 - (p.price - floor) / range) * 94,
  }));
  const line = plotted.map((p) => `${p.x},${p.y}`).join(" ");
  const summary = `${assetLabel} USD price from ${new Date(first.time).toISOString()} to ${new Date(last.time).toISOString()}. First ${usd.format(first.price)}, latest ${usd.format(last.price)}, low ${usd.format(low)}, high ${usd.format(high)}.`;
  return (
    <div className={cn("w-full", compact ? "h-24" : "h-40")}>
      <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
        <span>Low {usd.format(low)}</span>
        <span>High {usd.format(high)}</span>
      </div>
      <svg
        className={cn("w-full text-primary", compact ? "h-16" : "h-28")}
        viewBox="0 0 320 112"
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
      >
        <title>{summary}</title>
        <polyline
          key={`${first.time}-${last.time}-${last.price}`}
          className="price-chart-line"
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {plotted.map((point, index) => (
          <circle
            key={series[index]!.time}
            cx={point.x}
            cy={point.y}
            r="1"
            fill="currentColor"
            opacity=".65"
          />
        ))}
        <circle cx={plotted.at(-1)!.x} cy={plotted.at(-1)!.y} r="3" fill="currentColor" />
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {new Date(first.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span>24h · CoinGecko</span>
        <span>
          {new Date(last.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <div className="sr-only">
        <table>
          <caption>{assetLabel} USD price observations</caption>
          <thead>
            <tr>
              <th>Time</th>
              <th>USD</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.time}>
                <td>{new Date(p.time).toISOString()}</td>
                <td>{usd.format(p.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
