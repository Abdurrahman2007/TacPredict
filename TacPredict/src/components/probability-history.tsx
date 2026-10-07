import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { probabilityHistoryOptions } from "@/lib/probability-history.functions";
import type { Market } from "@/domain/markets/types";
const colors = ["#e0b627", "#2fc790", "#799aef"];
export function ProbabilityHistoryChart({ market }: { market: Market }) {
  const [interval, setInterval] = useState<"1h" | "1d" | "1w" | "1m">("1d"),
    [selected, setSelected] = useState<number | null>(null);
  const { data, isPending } = useQuery(probabilityHistoryOptions(market.id, interval));
  const all = useMemo(
    () => data?.series.flatMap((s) => s.points).sort((a, b) => a.time - b.time) ?? [],
    [data],
  );
  const first = all[0]?.time ?? 0,
    last = all.at(-1)?.time ?? 0;
  const observed = data?.series.filter((s) => s.points.length > 1) ?? [];
  const x = (time: number) => 8 + ((time - first) / Math.max(1, last - first)) * 296,
    y = (value: number) => 180 - value * 1.65;
  const selectedTime =
    selected === null || !all.length
      ? null
      : all.reduce(
          (best, p) => (Math.abs(p.time - selected) < Math.abs(best.time - selected) ? p : best),
          all[0]!,
        ).time;
  return (
    <section className="mt-6" aria-label="Outcome probability chart">
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2">
        {market.outcomes.slice(0, 3).map((o, i) => (
          <span key={o.id} className="flex items-center gap-2 text-sm">
            <span className="size-2 rounded-full" style={{ background: colors[i] }} />
            {o.label}
            <span className="text-muted-foreground">{o.probability}%</span>
          </span>
        ))}
      </div>
      {observed.length ? (
        <div
          className="relative h-52 sm:h-64"
          tabIndex={0}
          role="slider"
          aria-label="Outcome history. Tap or use arrow keys to inspect."
          aria-valuemin={0}
          aria-valuemax={Math.max(0, all.length - 1)}
          aria-valuenow={
            selectedTime === null ? all.length - 1 : all.findIndex((p) => p.time === selectedTime)
          }
          onPointerDown={(e) => {
            const b = e.currentTarget.getBoundingClientRect();
            setSelected(
              first +
                Math.max(0, Math.min(1, (((e.clientX - b.left) / b.width) * 360 - 8) / 296)) *
                  (last - first),
            );
          }}
          onPointerMove={(e) => {
            if (e.pointerType === "mouse") {
              const b = e.currentTarget.getBoundingClientRect();
              setSelected(
                first +
                  Math.max(0, Math.min(1, (((e.clientX - b.left) / b.width) * 360 - 8) / 296)) *
                    (last - first),
              );
            }
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setSelected(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSelected(null);
            if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
              e.preventDefault();
              const i =
                selectedTime === null
                  ? all.length - 1
                  : all.findIndex((p) => p.time === selectedTime);
              setSelected(
                all[Math.max(0, Math.min(all.length - 1, i + (e.key === "ArrowLeft" ? -1 : 1)))]!
                  .time,
              );
            }
          }}
        >
          <svg
            className="h-full w-full"
            viewBox="0 0 360 200"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${market.title} historical source probabilities`}
          >
            {[20, 40, 60, 80].map((v) => (
              <line
                key={v}
                x1="8"
                x2="350"
                y1={y(v)}
                y2={y(v)}
                stroke="#354044"
                strokeDasharray="2 4"
              />
            ))}
            {observed.map((s) => {
              const i = data!.series.findIndex((t) => t.label === s.label);
              return (
                <polyline
                  key={s.label}
                  points={s.points.map((p) => `${x(p.time)},${y(p.probability)}`).join(" ")}
                  fill="none"
                  stroke={colors[i]}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
              );
            })}
          </svg>
          {observed.map((s) => {
            const p = s.points.at(-1)!;
            const i = data!.series.findIndex((t) => t.label === s.label);
            return (
              <span
                key={s.label}
                className="pointer-events-none absolute size-2 rounded-full ring-4 ring-foreground/5"
                style={{
                  left: `${(x(p.time) / 360) * 100}%`,
                  top: `${(y(p.probability) / 200) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  background: colors[i],
                }}
              />
            );
          })}
          {[20, 40, 60, 80].map((v) => (
            <span
              key={v}
              className="absolute right-0 text-xs text-muted-foreground"
              style={{ top: `${(y(v) / 200) * 100}%`, transform: "translateY(-50%)" }}
            >
              {v}%
            </span>
          ))}
          {selectedTime !== null && (
            <>
              <span
                className="pointer-events-none absolute inset-y-0 border-l border-dashed border-foreground/35"
                style={{ left: `${(x(selectedTime) / 360) * 100}%` }}
              />
              <div
                role="status"
                className="pointer-events-none absolute top-1 rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-lg"
                style={{
                  left: `${Math.max(22, Math.min(75, (x(selectedTime) / 360) * 100))}%`,
                  transform: "translateX(-50%)",
                }}
              >
                {data!.series
                  .filter((s) => s.points.length)
                  .map((s, i) => {
                    const p = s.points.reduce(
                      (best, p) =>
                        Math.abs(p.time - selectedTime) < Math.abs(best.time - selectedTime)
                          ? p
                          : best,
                      s.points[0]!,
                    );
                    return (
                      <p key={s.label} style={{ color: colors[i] }}>
                        {s.label} {p.probability.toFixed(1)}% ·{" "}
                        {new Date(p.time).toISOString().slice(11, 16)}
                      </p>
                    );
                  })}
                <p className="mt-1 text-muted-foreground">
                  {new Date(selectedTime).toISOString().slice(5, 16).replace("T", " · ")} UTC
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="grid h-40 place-items-center rounded-xl bg-card/40 text-sm text-muted-foreground">
          {isPending ? "Loading chart…" : "History unavailable"}
        </div>
      )}
      {observed.length > 0 && (
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{new Date(first).toISOString().slice(5, 16).replace("T", " ")} UTC</span>
          <span>Polymarket</span>
          <span>{new Date(last).toISOString().slice(5, 16).replace("T", " ")} UTC</span>
        </div>
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{market.volume} source vol</span>
        <div className="flex gap-1">
          {(["1h", "1d", "1w", "1m"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={interval === v}
              onClick={() => {
                setInterval(v);
                setSelected(null);
              }}
              className={`min-h-11 rounded-xl px-3 text-sm ${interval === v ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
