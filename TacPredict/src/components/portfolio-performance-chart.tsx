import { useId, useState, type PointerEvent } from "react";
/** Read-only P/L view. Empty history is a zero baseline, never a synthetic price curve. */
export function PortfolioPerformanceChart({
  empty,
  period,
  preview = false,
  hidden = false,
}: {
  empty: boolean;
  period: string;
  preview?: boolean;
  hidden?: boolean;
}) {
  const baseline = empty || preview;
  const amount = hidden ? "••••" : "$0.00";
  const id = useId().replace(/:/g, "");
  const [cursor, setCursor] = useState<number | null>(null);
  function scrub(e: PointerEvent<HTMLDivElement>) {
    if (!baseline || hidden) return;
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
          baseline
            ? preview
              ? "Disconnected portfolio preview: zero baseline, not a wallet balance."
              : "Empty portfolio: zero profit or loss. Move pointer or use arrow keys to inspect."
            : "Verified performance history is unavailable."
        }
        onPointerMove={scrub}
        onPointerDown={scrub}
        onPointerLeave={() => setCursor(null)}
        onFocus={() => {
          if (baseline && !hidden) setCursor(50);
        }}
        onBlur={() => setCursor(null)}
        onKeyDown={(e) => {
          if (baseline && !hidden && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
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
          {baseline && (
            <>
              <path d="M0 86H400V144H0Z" fill={`url(#zero-fill-${id})`} />
              <path className="tp-pnl-baseline" d="M0 86H400" />
            </>
          )}
        </svg>
        {baseline ? (
          <span className="tp-chart-zero">{amount}</span>
        ) : (
          <span className="tp-chart-unavailable">Performance history not yet available</span>
        )}
        {baseline && !hidden && cursor !== null && (
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
              {amount} <small>{preview ? "Preview" : "No trades"}</small>
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
              : "Awaiting verified history"}
        </span>
      </div>
    </div>
  );
}
