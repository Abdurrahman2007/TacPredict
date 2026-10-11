import { useId, useState, type PointerEvent } from "react";
/** Read-only P/L view. Empty history is a zero baseline, never a synthetic price curve. */
export function PortfolioPerformanceChart({ empty, period }: { empty: boolean; period: string }) {
  const id = useId().replace(/:/g, "");
  const [cursor, setCursor] = useState<number | null>(null);
  function scrub(e: PointerEvent<HTMLDivElement>) {
    if (!empty) return;
    const box = e.currentTarget.getBoundingClientRect();
    setCursor(Math.max(0, Math.min(100, ((e.clientX - box.left) / box.width) * 100)));
  }
  return (
    <div className="tp-performance-chart" aria-label={`Profit and loss chart · ${period}`}>
      <div
        className="tp-chart-surface"
        tabIndex={0}
        role="group"
        aria-label={
          empty
            ? "Empty portfolio: zero profit or loss. Move pointer or use arrow keys to inspect."
            : "Verified performance history is unavailable."
        }
        onPointerMove={scrub}
        onPointerDown={scrub}
        onPointerLeave={() => setCursor(null)}
        onFocus={() => {
          if (empty) setCursor(50);
        }}
        onBlur={() => setCursor(null)}
        onKeyDown={(e) => {
          if (empty && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            setCursor(
              Math.max(0, Math.min(100, (cursor ?? 50) + (e.key === "ArrowRight" ? 5 : -5))),
            );
          }
        }}
      >
        <svg viewBox="0 0 400 144" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`zero-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity=".13" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="tp-chart-grid" d="M0 30H400M0 70H400M0 110H400" />
          {empty && (
            <>
              <path d="M0 86H400V144H0Z" fill={`url(#zero-fill-${id})`} />
              <path className="tp-pnl-baseline" d="M0 86H400" />
            </>
          )}
        </svg>
        {empty ? (
          <span className="tp-chart-zero">$0.00</span>
        ) : (
          <span className="tp-chart-unavailable">No verified performance history</span>
        )}
        {empty && cursor !== null && (
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
              $0.00 <small>No trades</small>
            </span>
          </div>
        )}
      </div>
      <div className="tp-chart-caption">
        <span>{period}</span>
        <span>{empty ? "No trades yet" : "History unavailable"}</span>
      </div>
    </div>
  );
}
