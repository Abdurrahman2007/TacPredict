import { memo, useCallback, useEffect, useId, useMemo, useRef } from "react";
import { observedCandles, referenceLabelY } from "@/lib/updown/chart-window.mjs";
import { clock, useTimeZone } from "@/lib/updown/use-clock";
import {
  formatUsd,
  type Candle,
  type PricePoint,
  type UpDownAsset,
  type Win,
} from "@/lib/updown/window.mjs";

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

/** Monotone cubic (Fritsch–Carlson) path: smooth like iOS Stocks, never overshoots real values. */
function smoothPath(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n === 0) return "";
  if (n < 3) return `M${xs.map((x, i) => `${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(" L")}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = xs[i + 1]! - xs[i]! || 1e-6;
    dx.push(h);
    m.push((ys[i + 1]! - ys[i]!) / h);
  }
  const t: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) {
    const a = m[i - 1]!;
    const b = m[i]!;
    if (a * b <= 0) t.push(0);
    else {
      const w1 = 2 * dx[i]! + dx[i - 1]!;
      const w2 = dx[i]! + 2 * dx[i - 1]!;
      t.push((w1 + w2) / (w1 / a + w2 / b));
    }
  }
  t.push(m[n - 2]!);
  let d = `M${xs[0]!.toFixed(1)},${ys[0]!.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3;
    d += ` C${(xs[i]! + h).toFixed(1)},${(ys[i]! + t[i]! * h).toFixed(1)} ${(xs[i + 1]! - h).toFixed(1)},${(ys[i + 1]! - t[i + 1]! * h).toFixed(1)} ${xs[i + 1]!.toFixed(1)},${ys[i + 1]!.toFixed(1)}`;
  }
  return d;
}

/** Index of the observation closest to x, by binary search (xs are ascending). */
function nearestIndex(xs: number[], x: number) {
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! < x) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[lo]! - x) <= Math.abs(xs[hi]! - x) ? lo : hi;
}

type Props = {
  w: Win;
  series: PricePoint[];
  beat: number | null;
  asset: UpDownAsset;
  live: boolean;
  source?: string;
  compact?: boolean;
  interactive?: boolean;
  chartType?: "line" | "candles";
  ohlc?: Candle[] | undefined;
  /** The trading window being shown; history before it is drawn muted, the live part bright. */
  window?: { start: number; end: number } | undefined;
};

/**
 * Price chart for one window. Every point is a real observation from the specified source.
 * The drag crosshair is driven by refs inside requestAnimationFrame, so scrubbing never
 * re-renders React and stays at 60fps on phones.
 */
export const UpDownChart = memo(function UpDownChart({
  w,
  series,
  beat,
  asset,
  live,
  source = "Coinbase",
  compact = false,
  interactive = true,
  chartType = "line",
  ohlc,
  window: tradeWindow,
}: Props) {
  const H = compact ? 176 : 232;
  const gradient = useId().replace(/:/g, "");
  const zone = useTimeZone();

  const geometry = useMemo(() => {
    if (!series.length) return null;
    let low = Infinity;
    let high = -Infinity;
    for (const p of series) {
      if (p.price < low) low = p.price;
      if (p.price > high) high = p.price;
    }
    if (chartType === "candles")
      for (const c of ohlc ?? []) {
        if (c.low < low) low = c.low;
        if (c.high > high) high = c.high;
      }
    if (beat !== null) {
      low = Math.min(low, beat);
      high = Math.max(high, beat);
    }
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
    const xs = series.map((p) => x(p.time));
    const ys = series.map((p) => y(p.price));
    return { low, high, x, y, xs, ys };
  }, [series, beat, w.start, w.end, H, ohlc, chartType]);

  const root = useRef<HTMLDivElement>(null);
  const cross = useRef<SVGGElement>(null);
  const crossLine = useRef<SVGLineElement>(null);
  const crossDot = useRef<SVGCircleElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const probePrice = useRef<HTMLElement>(null);
  const probeTime = useRef<HTMLTimeElement>(null);
  const frame = useRef(0);
  const pending = useRef<number | null>(null);
  const shown = useRef<number | null>(null);
  const geo = useRef(geometry);
  geo.current = geometry;
  const data = useRef({ series, asset, zone });
  data.current = { series, asset, zone };

  const paint = useCallback(() => {
    frame.current = 0;
    const g = geo.current;
    const i = pending.current;
    const { series: s, asset: a, zone: z } = data.current;
    if (!g || !cross.current || !probe.current) return;
    if (i === null || !s[i]) {
      shown.current = null;
      cross.current.style.opacity = "0";
      probe.current.style.opacity = "0";
      return;
    }
    shown.current = i;
    const px = g.xs[i]!;
    const py = g.ys[i]!;
    crossLine.current?.setAttribute("x1", px.toFixed(1));
    crossLine.current?.setAttribute("x2", px.toFixed(1));
    crossDot.current?.setAttribute("cx", px.toFixed(1));
    crossDot.current?.setAttribute("cy", py.toFixed(1));
    cross.current.style.opacity = "1";
    const pct = Math.max(18, Math.min(80, (px / W) * 100));
    probe.current.style.opacity = "1";
    probe.current.style.left = `${pct}%`;
    if (probePrice.current) probePrice.current.textContent = formatUsd(s[i]!.price, a);
    if (probeTime.current) probeTime.current.textContent = clock(s[i]!.time, z, true);
  }, []);

  const schedule = useCallback(
    (i: number | null) => {
      pending.current = i;
      if (!frame.current) frame.current = requestAnimationFrame(paint);
    },
    [paint],
  );

  // Keep an active crosshair pinned to the same observation when new data arrives.
  useEffect(() => {
    if (shown.current !== null) schedule(Math.min(shown.current, series.length - 1));
  }, [series, schedule]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const fromClientX = useCallback(
    (clientX: number) => {
      const g = geo.current;
      const el = root.current;
      if (!g || !el || !g.xs.length) return;
      const b = el.getBoundingClientRect();
      const vx = ((clientX - b.left) / b.width) * W;
      schedule(nearestIndex(g.xs, vx));
    },
    [schedule],
  );

  const layer = useMemo(() => {
    if (!geometry) return null;
    const { low, high, x, y, xs, ys } = geometry;
    const last = series[series.length - 1]!;
    const color = "#3b6cff";
    const candles = ohlc?.length ? ohlc : observedCandles(series, w);
    const lastColor = beat === null ? color : last.price >= beat ? "#28b357" : "#ff333d";
    const beatTagY =
      beat === null ? 0 : referenceLabelY(y(beat), y(last.price), T + 12, H - B - 12);
    const line = smoothPath(xs, ys);
    const area = `${line} L${xs.at(-1)!.toFixed(1)},${H - B} L${xs[0]!.toFixed(1)},${H - B} Z`;
    const ticks = (compact ? [0.2, 0.8] : [0.15, 0.5, 0.85]).map((f) => high - (high - low) * f);
    const timeTicks = compact ? [0, 1] : [0, 1 / 3, 2 / 3, 1];
    const lx = xs.at(-1)!;
    const ly = ys.at(-1)!;
    // Window start inside the visible range: everything before it is past history.
    const startX =
      tradeWindow && tradeWindow.start > w.start && tradeWindow.start < w.end
        ? x(tradeWindow.start)
        : null;
    const liveZone = startX !== null && lx > startX;
    const timeGrid = (compact ? [1 / 3, 2 / 3] : [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]).map(
      (f) => L + (W - L - R) * f,
    );
    return (
      <>
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${gradient}-live`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3b6cff" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#3b6cff" stopOpacity="0.02" />
          </linearGradient>
          {startX !== null && (
            <>
              <clipPath id={`${gradient}-past`}>
                <rect x={0} y={0} width={startX} height={H} />
              </clipPath>
              <clipPath id={`${gradient}-now`}>
                <rect x={startX} y={0} width={W - startX} height={H} />
              </clipPath>
            </>
          )}
        </defs>
        {/* Time grid: thin vertical lines like a trading terminal. */}
        {timeGrid.map((gx) => (
          <line
            key={gx}
            x1={gx}
            x2={gx}
            y1={T - 6}
            y2={H - B}
            stroke="#ffffff"
            strokeOpacity="0.05"
            strokeWidth="1"
          />
        ))}
        {liveZone && (
          <g className="ud-live-zone">
            <rect
              x={startX!}
              y={T - 6}
              width={Math.max(0, lx - startX!)}
              height={H - B - T + 6}
              fill={`url(#${gradient}-live)`}
            />
            <line
              x1={startX!}
              x2={startX!}
              y1={T - 6}
              y2={H - B}
              stroke="#8ea2ff"
              strokeOpacity=".55"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <rect x={startX! + 4} y={T - 6} width="34" height="15" rx="7.5" fill="#3b6cff33" />
            <text
              x={startX! + 21}
              y={T + 4.5}
              fontSize="9"
              fontWeight="700"
              fill="#b9c6ff"
              textAnchor="middle"
            >
              START
            </text>
            {live && (
              <line
                x1={lx}
                x2={lx}
                y1={T - 6}
                y2={H - B}
                stroke="#34c759"
                strokeOpacity=".5"
                strokeWidth="1"
              />
            )}
          </g>
        )}
        {ticks
          .filter(
            (t) => Math.abs(y(t) - ly) > 24 && (beat === null || Math.abs(y(t) - beatTagY) > 24),
          )
          .map((t) => (
            <g key={t}>
              <line
                x1={L}
                x2={W - R}
                y1={y(t)}
                y2={y(t)}
                stroke="#27323a"
                strokeWidth="1"
                strokeDasharray="2 5"
              />
              <text x={W - R + 8} y={y(t) + 4} fontSize="10.5" fill="#7d8b97">
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
              stroke="#9fb0c8"
              strokeOpacity=".8"
              strokeWidth="1.2"
              strokeDasharray="5 5"
            />
            <text
              x={L + 2}
              y={y(beat) - 6}
              fontSize="10.5"
              fill="#b8c4d9"
              style={{ paintOrder: "stroke", stroke: "#0f161a", strokeWidth: 4 }}
            >
              Price to beat
            </text>
            <rect x={W - R + 4} y={beatTagY - 9} width={R - 4} height="18" rx="9" fill="#2a333a" />
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
            const fill = c.close >= c.open ? "#34c759" : "#ff3b30";
            return (
              <g key={c.time}>
                <line
                  x1={center}
                  x2={center}
                  y1={y(c.high)}
                  y2={y(c.low)}
                  stroke={fill}
                  strokeWidth="1.2"
                />
                <rect
                  x={center - width / 2}
                  y={Math.min(y(c.open), y(c.close))}
                  width={width}
                  height={Math.max(1.2, Math.abs(y(c.open) - y(c.close)))}
                  rx="1"
                  fill={fill}
                />
              </g>
            );
          })
        ) : (
          <>
            <path d={area} fill={`url(#${gradient})`} />
            {startX !== null ? (
              <>
                <path
                  d={line}
                  fill="none"
                  stroke="#6f86b8"
                  strokeOpacity=".55"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  clipPath={`url(#${gradient}-past)`}
                />
                <path
                  d={line}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  clipPath={`url(#${gradient}-now)`}
                  className="ud-line-glow"
                />
              </>
            ) : (
              <path
                d={line}
                fill="none"
                stroke={color}
                strokeWidth="2.2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
          </>
        )}
        {live && <circle className="ud-pulse" cx={lx} cy={ly} r="4" fill={color} />}
        <circle cx={lx} cy={ly} r="4.2" fill={color} stroke="#0f161a" strokeWidth="2" />
        <g aria-label={`Latest observed price ${formatUsd(last.price, asset)}`}>
          <rect x={W - 79} y={ly - 11} width="78" height="22" rx="11" fill={lastColor} />
          <text x={W - 40} y={ly + 4} textAnchor="middle" fontSize="10.5" fill="#fff">
            {formatUsd(last.price, asset)}
          </text>
        </g>
        {timeTicks.map((f, i) => {
          const t = w.start + (w.end - w.start) * f;
          const anchor = i === 0 ? "start" : i === timeTicks.length - 1 ? "end" : "middle";
          return (
            <text
              key={f}
              x={L + (W - L - R) * f}
              y={H - 6}
              fontSize="10"
              fill="#7d8b97"
              textAnchor={anchor}
            >
              {clock(t, zone, w.end - w.start <= 45 * 60000)}
            </text>
          );
        })}
      </>
    );
  }, [
    geometry,
    series,
    ohlc,
    w,
    beat,
    H,
    compact,
    chartType,
    gradient,
    live,
    asset,
    zone,
    tradeWindow?.start,
    tradeWindow?.end,
  ]);

  if (!geometry) return <div className="ud-chart ud-chart-empty">Waiting for price data…</div>;
  const last = series[series.length - 1]!;

  return (
    <div
      ref={root}
      className="ud-chart ud-chart-interactive"
      role={interactive ? "slider" : "img"}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`${asset} price chart. Drag or use arrow keys to inspect real observations.`}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? Math.max(0, series.length - 1) : undefined}
      aria-valuetext={`${formatUsd(last.price, asset)} latest; ${source}`}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === "Escape") schedule(null);
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const cur = shown.current ?? series.length - 1;
          const i =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? series.length - 1
                : Math.max(0, Math.min(series.length - 1, cur + (e.key === "ArrowLeft" ? -1 : 1)));
          schedule(i);
        }
      }}
      onBlur={() => schedule(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${asset} ${source} price history. Latest ${formatUsd(last.price, asset)}${beat !== null ? `, price to beat ${formatUsd(beat, asset)}` : ""}.`}
        style={{ touchAction: interactive ? "pan-y" : undefined }}
        onPointerDown={(e) => {
          if (!interactive) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          fromClientX(e.clientX);
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          if (e.pointerType !== "mouse") schedule(null);
        }}
        onPointerCancel={() => schedule(null)}
        onPointerMove={(e) => {
          if (
            interactive &&
            (e.pointerType === "mouse" || e.currentTarget.hasPointerCapture(e.pointerId))
          )
            fromClientX(e.clientX);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") schedule(null);
        }}
      >
        {layer}
        <g ref={cross} aria-hidden="true" style={{ opacity: 0 }} className="ud-cross">
          <line
            ref={crossLine}
            y1={T}
            y2={H - B}
            stroke="#93a5b3"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          <circle ref={crossDot} r="4.5" fill="#fff" stroke="#3b6cff" strokeWidth="2.2" />
        </g>
      </svg>
      <div ref={probe} className="ud-chart-probe" aria-hidden="true" style={{ opacity: 0 }}>
        <strong ref={probePrice} />
        <time ref={probeTime} />
      </div>
    </div>
  );
});
