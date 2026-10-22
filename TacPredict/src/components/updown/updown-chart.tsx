import { useId, useMemo, useState } from "react";
import { observedCandles } from "@/lib/updown/chart-window.mjs";
import { clock, useTimeZone } from "@/lib/updown/use-clock";
import { formatUsd, type PricePoint, type UpDownAsset, type Win } from "@/lib/updown/window.mjs";

const W = 360;
const L = 6;
const R = 82;
const T = 18;
const B = 26;

function tick(price: number) {
  return price >= 1000
    ? `$${Math.round(price).toLocaleString("en-US")}`
    : `$${price.toFixed(price < 10 ? 3 : 2)}`;
}

/**
 * Price chart for one window. The x axis is the whole window, so the line grows from left to
 * right; the dashed line is the price to beat. Every point is a real observation from the specified source.
 */
export function UpDownChart({
  w,
  series,
  beat,
  asset,
  live,
  source = "Coinbase",
  compact = false,
  interactive = true,
  chartType = "line",
}: {
  w: Win;
  series: PricePoint[];
  beat: number | null;
  asset: UpDownAsset;
  live: boolean;
  source?: string;
  compact?: boolean;
  interactive?: boolean;
  chartType?: "line" | "candles";
}) {
  const H = compact ? 176 : 232;
  const gradient = useId().replace(/:/g, "");
  const zone = useTimeZone();
  const [probe, setProbe] = useState<PricePoint | null>(null);

  const geometry = useMemo(() => {
    if (!series.length) return null;
    const prices = series.map((p) => p.price);
    if (beat !== null) prices.push(beat);
    let low = Math.min(...prices);
    let high = Math.max(...prices);
    const minRange = (beat ?? high) * 0.00006;
    if (high - low < minRange) {
      const mid = (high + low) / 2;
      low = mid - minRange / 2;
      high = mid + minRange / 2;
    }
    const pad = (high - low) * 0.18;
    low -= pad;
    high += pad;
    const span = Math.max(1, w.end - w.start);
    const x = (t: number) => L + Math.max(0, Math.min(1, (t - w.start) / span)) * (W - L - R);
    const y = (p: number) => T + (1 - (p - low) / (high - low)) * (H - T - B);
    return { low, high, x, y };
  }, [series, beat, w, H]);

  if (!geometry) return <div className="ud-chart ud-chart-empty">Waiting for price data…</div>;

  const { low, high, x, y } = geometry;
  const last = series[series.length - 1]!;
  const color = "#315dff";
  const candles = observedCandles(series, w);
  const lastColor = beat === null ? color : last.price >= beat ? "#28b357" : "#ff333d";
  const beatTagY =
    beat !== null && Math.abs(y(beat) - y(last.price)) < 30
      ? Math.max(T + 12, y(beat) - 30)
      : beat !== null
        ? y(beat)
        : 0;
  const observedProbe = series.find((p) => p.time === probe?.time) ?? null;
  const selectedIndex = observedProbe ? series.indexOf(observedProbe) : series.length - 1;
  const points = series.map((p) => `${x(p.time).toFixed(1)},${y(p.price).toFixed(1)}`);
  const line = `M${points.join(" L")}`;
  const area = `${line} L${x(last.time).toFixed(1)},${H - B} L${x(series[0]!.time).toFixed(1)},${H - B} Z`;
  const ticks = (compact ? [0.2, 0.8] : [0.15, 0.5, 0.85]).map((f) => high - (high - low) * f);

  function inspect(clientX: number, bounds: DOMRect) {
    const fraction = Math.max(
      0,
      Math.min(1, (((clientX - bounds.left) / bounds.width) * W - L) / (W - L - R)),
    );
    const target = w.start + fraction * (w.end - w.start);
    setProbe(
      series.reduce(
        (best, p) => (Math.abs(p.time - target) < Math.abs(best.time - target) ? p : best),
        series[0]!,
      ),
    );
  }

  return (
    <div
      className="ud-chart ud-chart-interactive"
      role={interactive ? "slider" : "img"}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`${asset} price chart. Drag or use arrow keys to inspect real observations.`}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? Math.max(0, series.length - 1) : undefined}
      aria-valuenow={interactive ? selectedIndex : undefined}
      aria-valuetext={`${formatUsd(series[selectedIndex]!.price, asset)} at ${clock(series[selectedIndex]!.time, zone, true)}; ${source}`}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === "Escape") setProbe(null);
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const i =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? series.length - 1
                : Math.max(
                    0,
                    Math.min(series.length - 1, selectedIndex + (e.key === "ArrowLeft" ? -1 : 1)),
                  );
          setProbe(series[i]!);
        }
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${asset} ${source} price history. Latest ${formatUsd(last.price, asset)}${beat !== null ? `, price to beat ${formatUsd(beat, asset)}` : ""}.`}
        onPointerDown={(e) =>
          interactive && inspect(e.clientX, e.currentTarget.getBoundingClientRect())
        }
        onPointerMove={(e) => {
          if (interactive && (e.pointerType === "mouse" || e.buttons === 1))
            inspect(e.clientX, e.currentTarget.getBoundingClientRect());
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setProbe(null);
        }}
      >
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks
          .filter(
            (t) =>
              Math.abs(y(t) - y(last.price)) > 17 &&
              (beat === null || Math.abs(y(t) - beatTagY) > 17),
          )
          .map((t) => (
            <g key={t}>
              <line
                x1={L}
                x2={W - R}
                y1={y(t)}
                y2={y(t)}
                stroke="#2f3a41"
                strokeWidth="1"
                strokeDasharray="2 5"
              />
              <text x={W - R + 8} y={y(t) + 4} fontSize="10.5" fill="#8d9aa6">
                {tick(t)}
              </text>
            </g>
          ))}
        {beat !== null && (
          <g>
            <line
              x1={L}
              x2={W - R}
              y1={y(beat)}
              y2={y(beat)}
              stroke="#b8c4d9"
              strokeWidth="1.4"
              strokeDasharray="6 5"
            />
            <text x={L + 2} y={y(beat) - 6} fontSize="10.5" fill="#b8c4d9">
              Price to beat
            </text>
            <rect x={W - R + 4} y={beatTagY - 9} width={R - 4} height="18" rx="9" fill="#2d363d" />
            <text x={W - R + 8} y={beatTagY + 4} fontSize="10.5" fill="#e8edf3">
              {tick(beat)}
            </text>
          </g>
        )}
        {chartType === "candles" ? (
          candles.map((c) => {
            const width = Math.max(
              3,
              Math.min(12, ((W - L - R) / Math.max(1, candles.length)) * 0.65),
            );
            const center = x(c.time);
            const fill = c.close >= c.open ? "#55c878" : "#ff3d35";
            return (
              <g key={c.time}>
                <line
                  x1={center}
                  x2={center}
                  y1={y(c.high)}
                  y2={y(c.low)}
                  stroke={fill}
                  strokeWidth="1.4"
                />
                <rect
                  x={center - width / 2}
                  y={Math.min(y(c.open), y(c.close))}
                  width={width}
                  height={Math.max(1.2, Math.abs(y(c.open) - y(c.close)))}
                  rx=".7"
                  fill={fill}
                />
              </g>
            );
          })
        ) : (
          <>
            <path d={area} fill={`url(#${gradient})`} />
            <path
              d={line}
              fill="none"
              stroke={color}
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}
        {live && (
          <circle className="ud-pulse" cx={x(last.time)} cy={y(last.price)} r="4" fill={color} />
        )}
        <circle
          cx={x(last.time)}
          cy={y(last.price)}
          r="4.2"
          fill={color}
          stroke="#0f161a"
          strokeWidth="2"
        />
        <g aria-label={`Latest observed price ${formatUsd(last.price, asset)}`}>
          <rect x={W - 79} y={y(last.price) - 11} width="78" height="22" rx="11" fill={lastColor} />
          <text x={W - 40} y={y(last.price) + 4} textAnchor="middle" fontSize="10.5" fill="#fff">
            {formatUsd(last.price, asset)}
          </text>
        </g>
        {observedProbe && (
          <g aria-hidden="true">
            <line
              x1={x(observedProbe.time)}
              x2={x(observedProbe.time)}
              y1={T}
              y2={H - B}
              stroke="#93a5b3"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <circle
              cx={x(observedProbe.time)}
              cy={y(observedProbe.price)}
              r="4"
              fill="#fff"
              stroke={color}
              strokeWidth="2"
            />
          </g>
        )}
        <text x={L} y={H - 6} fontSize="10.5" fill="#8d9aa6">
          {clock(w.start, zone, w.minutes <= 30)}
        </text>
        <text x={W - R} y={H - 6} fontSize="10.5" fill="#8d9aa6" textAnchor="end">
          {clock(w.end, zone, w.minutes <= 30)}
        </text>
      </svg>
      {observedProbe && (
        <div
          className="ud-chart-probe"
          role="status"
          style={{ left: `${Math.max(20, Math.min(78, (x(observedProbe.time) / W) * 100))}%` }}
        >
          <strong>{formatUsd(observedProbe.price, asset)}</strong>
          <time dateTime={new Date(observedProbe.time).toISOString()}>
            {clock(observedProbe.time, zone, true)}
          </time>
        </div>
      )}
    </div>
  );
}
