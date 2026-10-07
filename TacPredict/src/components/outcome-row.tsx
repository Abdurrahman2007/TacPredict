import type { MarketOutcome } from "@/domain/markets/types";
export function OutcomeRow({ outcome, index }: { outcome: MarketOutcome; index: number }) {
  const binary = /^(yes|no|up|down)$/i.test(outcome.label);
  return (
    <>
      <div className="min-w-0 flex-1">
        <span
          className={`block truncate text-base font-medium ${binary ? (index === 0 ? "text-positive" : "text-destructive") : "text-foreground"}`}
        >
          {outcome.label}
        </span>
        <div className="mt-2 h-[3px] w-full rounded-full bg-border/40">
          <div
            className={`h-full rounded-full ${index === 0 ? "bg-positive" : "bg-destructive"}`}
            style={{ width: `${Math.max(0, Math.min(100, outcome.probability))}%` }}
          />
        </div>
      </div>
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
        {outcome.probability > 0 ? `${(100 / outcome.probability).toFixed(2)}x` : "—"}
      </span>
      <span className="grid min-h-11 min-w-16 shrink-0 place-items-center rounded-full bg-secondary px-3 text-base font-semibold tabular-nums">
        {outcome.probability}%
      </span>
    </>
  );
}
