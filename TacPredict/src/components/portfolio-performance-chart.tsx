import { useId, useMemo, useState, type PointerEvent } from "react";

export type PnlPoint = { at: number; pnl: number };

function money(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Real cumulative realized P/L from the ledger — never a synthetic price curve. */
export function PortfolioPerformanceChart({
  points,
  empty,
  period,
  preview = false,
  hidden = false,
}: {
  points?: PnlPoint[];
  empty: boolean;
  period: string;
  preview?: boolean;
  hidden?: boolean;
}) {
  const series = useMemo(() => {
    const list = (points ?? []).filter((p) => Number.isFinite(p.at) && Number.isFinite(p.pnl));
    if (list.length === 0) return [];
    return [...list].sort((a, b) => a.at - b.at);
  }, [points]);

  const hasSeries = series.length > 0 && !preview && !hidden;
  const baseline = empty || preview || !hasSeries;
  const last = series.length ? series[series.length - 1]!.pnl : 0;
  const amount = hidden ? "••••" : money(last);
  const id = useId().replace(/:/g, "");
  const [cursor, setCursor] = useState<number | null>(null);

  const path = useMemo(() => {
    if (series.length === 0) return null;
    const minP = Math.min(0, ...series.map((p) => p.pnl));
    const maxP = Math.max(0, ...series.map((p) => p.pnl));
    const span = Math.max(1e-9, maxP - minP);
    const pad = span * 0.12;
    const lo = minP - pad;
    const hi = maxP + pad;
    const t0 = series[0]!.at;
    const t1 = series[series.length - 1]!.at;
    const tSpan = Math.max(1, t1 - t0);
    const coords = series.map((p) => {
      const x = ((p.at - t0) / tSpan) * 400;
      const y = 130 - ((p.pnl - lo) / (hi - lo || 1)) * 110;
      return { x, y, pnl: p.pnl };
    });
    const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
    const area = `${line} L400 144 L0 144 Z`;
    const zeroY = 130 - ((0 - lo) / (hi - lo || 1)) * 110;
    return { line, area, coords, zeroY, positive: last >= 0 };
  }, [series, last]);

  function scrub(e: PointerEvent<HTMLDivElement>) {
    if (hidden) return;
    const box = e.currentTarget.getBoundingClientRect();
    setCursor(Math.max(0, Math.min(100, ((e.clientX - box.left) / box.width) * 100)));
  }

  const scrubValue = (() => {
    if (cursor == null) return null;
    if (!path || path.coords.length === 0) return 0;
    const x = (cursor / 100) * 400;
    let best = path.coords[0]!;
    let bestD = Infinity;
    for (const c of path.coords) {
      const d = Math.abs(c.x - x);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best.pnl;
  })();

  return (
    <div className="tp-performance-chart" aria-label={`Profit and loss chart · ${period}`}>
      <div
        className="tp-chart-surface"
        tabIndex={0}
        role="group"
        aria-label={
          preview
            ? "Disconnected portfolio preview: zero baseline."
            : empty
              ? "Empty portfolio: zero profit or loss."
              : "Cumulative realized profit and loss from your trades."
        }
        onPointerMove={scrub}
        onPointerDown={scrub}
        onPointerLeave={() => setCursor(null)}
        onFocus={() => {
          if (!hidden) setCursor(50);
        }}
        onBlur={() => setCursor(null)}
        onKeyDown={(e) => {
          if (!hidden && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            setCursor(Math.max(0, Math.min(100, (cursor ?? 50) + (e.key === "ArrowRight" ? 5 : -5))));
          }
        }}
      >
        <svg viewBox="0 0 400 144" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`pnl-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={path?.positive ? "#4ade80" : "#f87171"}
                stopOpacity=".22"
              />
              <stop offset="100%" stopColor={path?.positive ? "#4ade80" : "#f87171"} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="tp-chart-grid" d="M0 30H400M0 70H400M0 110H400" />
          {baseline || !path ? (
            <>
              <path d="M0 86H400V144H0Z" fill={`url(#pnl-fill-${id})`} opacity={0.35} />
              <path className="tp-pnl-baseline" d="M0 86H400" />
            </>
          ) : (
            <>
              <path d={path.area} fill={`url(#pnl-fill-${id})`} />
              <path
                d={`M0 ${path.zeroY.toFixed(1)}H400`}
                className="tp-pnl-baseline"
                opacity={0.45}
              />
              <path
                d={path.line}
                fill="none"
                stroke={path.positive ? "#4ade80" : "#f87171"}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          )}
        </svg>
        <span className="tp-chart-zero">{hidden ? "••••" : baseline ? "$0.00" : amount}</span>
        {!hidden && cursor !== null && (
          <div className="tp-chart-cursor" style={{ left: `${cursor}%` }}>
            <i />
            <b />
            <span
              style={{
                transform:
                  cursor > 70
                    ? "translateX(-100%)"
                    : cursor < 25
                      ? "translateX(0)"
                      : "translateX(-50%)",
              }}
            >
              {hidden ? "••••" : money(scrubValue ?? 0)}{" "}
              <small>{preview ? "Preview" : empty ? "No trades" : "Realized"}</small>
            </span>
          </div>
        )}
      </div>
      <div className="tp-chart-caption">
        <span>{period}</span>
        <span>
          {preview
            ? "Wallet not connected · preview"
            : empty
              ? "No trades yet"
              : "From your trade history"}
        </span>
      </div>
    </div>
  );
}
