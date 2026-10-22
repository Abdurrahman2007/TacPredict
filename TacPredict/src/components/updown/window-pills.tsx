import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Link } from "@tanstack/react-router";
import { ChartCandlestick, ChevronDown, Clock3, LineChart } from "lucide-react";
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

/** Past history sheet, the live window and exactly one upcoming window. */
export function WindowPills({
  asset,
  minutes,
  nowMs,
  selected,
  candles,
  gran,
  pastCount,
  chartType = "line",
  onToggleChart,
}: {
  asset: UpDownAsset;
  minutes: number;
  nowMs: number;
  selected: Win;
  candles: Candle[] | undefined;
  gran: number;
  pastCount: number;
  chartType?: "line" | "candles";
  onToggleChart?: (() => void) | undefined;
}) {
  const zone = useTimeZone();
  const [open, setOpen] = useState(false);
  const current = windowStartFor(nowMs, minutes);
  const all = windowsAround(nowMs, minutes, pastCount, 1);
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
      {onToggleChart ? (
        <button
          type="button"
          className="ud-pill"
          aria-label={chartType === "line" ? "Show sampled candles" : "Show line chart"}
          title={chartType === "line" ? "Sampled candles" : "Line chart"}
          onClick={onToggleChart}
        >
          {chartType === "line" ? <ChartCandlestick size={18} /> : <LineChart size={18} />}
        </button>
      ) : (
        <Link to="/up-down" className="ud-pill" aria-label="All Up/Down markets">
          <LineChart size={18} />
        </Link>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button type="button" className="ud-pill ud-past-trigger">
            Past <ChevronDown size={15} className={open ? "ud-chevron-open" : undefined} />
          </button>
        </DialogTrigger>
        <DialogContent className="ud-history-sheet" overlayClassName="ud-history-overlay">
          <div className="ud-history-handle" aria-hidden="true" />
          <DialogTitle className="sr-only">Past windows</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a time to view its price history. Direction icons appear only when a result is
            available.
          </DialogDescription>
          <div className="ud-history-list">
            {past.map((w) => {
              const result = windowResult(candles, w, gran);
              return (
                <Link
                  key={w.start}
                  {...link(w)}
                  aria-current={w.start === selected.start ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span className="ud-history-time">
                    {result ? (
                      <span
                        className={`ud-history-result ${result.outcome === "Up" ? "is-up" : "is-down"}`}
                        aria-label={result.outcome}
                      >
                        {result.outcome === "Up" ? "▴" : "▾"}
                      </span>
                    ) : (
                      <Clock3
                        size={18}
                        className="ud-history-unknown"
                        aria-label="Result not available"
                      />
                    )}
                    {label(w)}
                  </span>
                  <span className="ud-history-day">
                    {dayLabel(w.start, zone) === dayLabel(nowMs, zone)
                      ? "Today"
                      : dayLabel(w.start, zone)}
                  </span>
                </Link>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
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
