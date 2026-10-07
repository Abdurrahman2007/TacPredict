import { memo, useId, useMemo } from "react";
import type { PricePoint } from "@/lib/market-data.functions";
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
export const MarketSparkline = memo(function MarketSparkline({
  points = [],
  assetLabel = "Crypto",
  sourceLabel = "Coinbase",
  compact = false,
}: {
  points?: PricePoint[];
  assetLabel?: string;
  sourceLabel?: string;
  compact?: boolean;
}) {
  const id = useId().replace(/:/g, "");
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
      <div className="grid h-52 place-items-center text-sm text-muted-foreground">
        Price unavailable
      </div>
    );
  const first = series[0]!,
    last = series.at(-1)!,
    low = Math.min(...series.map((p) => p.price)),
    high = Math.max(...series.map((p) => p.price));
  const range = Math.max(high - low, high * 0.00002),
    floor = low - range * 0.15,
    ceiling = high + range * 0.2;
  const y = (price: number) => 12 + (1 - (price - floor) / (ceiling - floor)) * 162;
  const plotted = series.map((p) => ({
    x: 8 + ((p.time - first.time) / Math.max(1, last.time - first.time)) * 272,
    y: y(p.price),
  }));
  const line = plotted.map((p) => `${p.x},${p.y}`).join(" "),
    endpoint = plotted.at(-1)!;
  const delta = last.price - first.price;
  return (
    <div>
      <div className="mb-5 flex items-start gap-5 sm:gap-8">
        <div>
          <p className="text-sm text-muted-foreground">Start</p>
          <p className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">
            {usd.format(first.price)}
          </p>
        </div>
        <div className="border-l border-border pl-5 sm:pl-8">
          <p className="text-sm text-[#57a6ff]">Now</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-[#57a6ff] sm:text-2xl">
            {usd.format(last.price)}
          </p>
          <p
            className={`mt-1 text-xs tabular-nums ${delta >= 0 ? "text-positive" : "text-destructive"}`}
          >
            {delta >= 0 ? "+" : "−"}
            {usd.format(Math.abs(delta))}
          </p>
        </div>
      </div>
      <div className="relative">
        <svg
          className={`w-full overflow-visible ${compact ? "h-40" : "h-56 sm:h-64"}`}
          viewBox="0 0 360 190"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${assetLabel} USD spot price. Start ${usd.format(first.price)}, latest ${usd.format(last.price)}. ${sourceLabel}.`}
        >
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#387dff" stopOpacity=".20" />
              <stop offset="100%" stopColor="#387dff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[low, (low + high) / 2, high].map((price, i) => (
            <g key={i}>
              <line
                x1="8"
                x2="350"
                y1={y(price)}
                y2={y(price)}
                stroke="currentColor"
                className="text-border"
                strokeDasharray="2 5"
              />
            </g>
          ))}
          <polygon points={`8,184 ${line} ${endpoint.x},184`} fill={`url(#${id})`} />
          <line
            x1="8"
            x2="280"
            y1={y(first.price)}
            y2={y(first.price)}
            stroke="#9eacb4"
            strokeOpacity=".45"
            strokeDasharray="4 5"
          />
          <polyline
            className="price-chart-line"
            points={line}
            fill="none"
            stroke="#387dff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {[low, (low + high) / 2, high]
          .filter((price) => Math.abs(y(price) - endpoint.y) > 18)
          .map((price, i) => (
            <span
              key={i}
              className="pointer-events-none absolute right-0 text-[11px] tabular-nums text-muted-foreground"
              style={{ top: `${(y(price) / 190) * 100}%`, transform: "translateY(-50%)" }}
            >
              {usd.format(price)}
            </span>
          ))}
        <span
          className="pointer-events-none absolute size-2 rounded-full bg-[#387dff] ring-[6px] ring-[#387dff]/15"
          style={{
            left: `${(endpoint.x / 360) * 100}%`,
            top: `${(endpoint.y / 190) * 100}%`,
            transform: "translate(-50%,-50%)",
          }}
        />
        <span
          className="pointer-events-none absolute right-0 rounded-full bg-[#2878ee] px-2 py-1 text-[11px] font-medium tabular-nums text-white"
          style={{ top: `${(endpoint.y / 190) * 100}%`, transform: "translateY(-50%)" }}
        >
          {usd.format(last.price)}
        </span>
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{new Date(first.time).toISOString().slice(11, 16)}</span>
        <span>{sourceLabel} · UTC</span>
        <span>{new Date(last.time).toISOString().slice(11, 16)}</span>
      </div>
    </div>
  );
});
