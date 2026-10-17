import { Link } from "@tanstack/react-router";
import { ChevronDown, LineChart } from "lucide-react";
import { clock, dayLabel, useTimeZone } from "@/lib/updown/use-clock";
import {
  slugOf,
  windowResult,
  windowsAround,
  windowStartFor,
  type Candle,
  type UpDownAsset,
  type Win,
} from "@/lib/updown/window.mjs";

/** Row under the chart: all windows, "Past" results, then the live window and the next ones. */
export function WindowPills({
  asset,
  minutes,
  nowMs,
  selected,
  candles,
  gran,
  pastCount,
}: {
  asset: UpDownAsset;
  minutes: number;
  nowMs: number;
  selected: Win;
  candles: Candle[] | undefined;
  gran: number;
  pastCount: number;
}) {
  const zone = useTimeZone();
  const current = windowStartFor(nowMs, minutes);
  const all = windowsAround(nowMs, minutes, pastCount, 3);
  const past = all.filter((w) => w.start < current).reverse();
  const ahead = all.filter((w) => w.start >= current);
  const label = (w: Win) =>
    minutes >= 1440
      ? dayLabel(w.start, zone)
      : minutes >= 720
        ? `${dayLabel(w.start, zone)} ${clock(w.start, zone)}`
        : clock(w.start, zone);
  const link = (w: Win) => ({
    to: "/up-down/$asset" as const,
    params: { asset: slugOf(asset) },
    search: { d: minutes, ...(w.start === current ? {} : { w: w.start }) },
  });

  return (
    <div className="ud-pills" aria-label="Time windows">
      <Link to="/up-down" className="ud-pill" aria-label="All Up/Down markets">
        <LineChart size={18} />
      </Link>
      <details className="ud-past" key={selected.start}>
        <summary className="ud-pill" style={{ listStyle: "none", cursor: "pointer" }}>
          Past <ChevronDown size={15} />
        </summary>
        <div className="ud-past-menu">
          {past.length === 0 ? (
            <p className="ud-muted" style={{ padding: 12 }}>
              No earlier windows yet.
            </p>
          ) : (
            past.map((w) => {
              const result = windowResult(candles, w, gran);
              return (
                <Link
                  key={w.start}
                  {...link(w)}
                  aria-current={w.start === selected.start ? "page" : undefined}
                >
                  <span>{label(w)}</span>
                  {result ? (
                    <span className={result.outcome === "Up" ? "ud-up" : "ud-down"}>
                      {result.outcome === "Up" ? "↑ Up" : "↓ Down"}
                    </span>
                  ) : (
                    <span className="ud-muted">No data</span>
                  )}
                </Link>
              );
            })
          )}
        </div>
      </details>
      {ahead.map((w) => (
        <Link
          key={w.start}
          {...link(w)}
          className="ud-pill"
          aria-current={w.start === selected.start ? "page" : undefined}
        >
          {w.start === current && <span className="ud-dot" aria-hidden="true" />}
          {label(w)}
        </Link>
      ))}
    </div>
  );
}
