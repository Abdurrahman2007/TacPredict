import { chartView } from "@/lib/updown/chart-window.mjs";
import { usePriceWindow } from "@/lib/updown/use-price-window";
import {
  ASSETS,
  deltaInfo,
  formatUsd,
  type PricePoint,
  type UpDownAsset,
  type Win,
} from "@/lib/updown/window.mjs";
import { UpDownChart } from "./updown-chart";

/** Sampled prices, not tick-by-tick. Chart data never changes locked settlement evidence. */
export function CoinGeckoChart({
  asset,
  window: selected,
  summary = false,
  evidence,
  chartType = "line",
}: {
  asset: UpDownAsset;
  window: Win;
  summary?: boolean;
  chartType?: "line" | "candles";
  evidence?: { points: PricePoint[]; beat: number | null; source: string } | undefined;
}) {
  const feed = usePriceWindow(asset, selected);
  const { snapshot, history, pending } = feed;
  const { series, range, mode } = evidence
    ? chartView(evidence.points, selected, Date.now())
    : feed;
  const boundary = evidence ? evidence.beat : feed.boundary;
  const first = series[0];
  const last = series.at(-1);
  const reference = boundary ?? first?.price ?? null;
  const delta = deltaInfo(last?.price, reference);
  return (
    <section className="cg-chart" aria-label={`${ASSETS[asset].name} price chart`}>
      {summary && (
        <dl className="tp-price-summary">
          <div>
            <dt title="Observed reference price; settlement follows the market rules">
              {boundary !== null ? "Beat:" : "Start:"}
            </dt>
            <dd>{reference !== null ? formatUsd(reference, asset) : pending ? "Loading…" : "—"}</dd>
          </div>
          <div>
            <dt className="tp-current">Now:</dt>
            <dd className="tp-current">
              {last ? formatUsd(last.price, asset) : pending ? "Loading…" : "—"}
              {delta && series.length > 1 && (
                <span className={delta.direction === "down" ? "ud-down" : "ud-up"}>
                  {delta.direction === "down" ? "↘" : "↗"}{" "}
                  {Math.abs(delta.abs).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              )}
            </dd>
          </div>
        </dl>
      )}
      {series.length ? (
        <UpDownChart
          w={range}
          series={series}
          compact={summary}
          chartType={chartType}
          beat={boundary}
          asset={asset}
          live={mode === "window" && Date.now() < selected.end}
          interactive={!summary}
          source={evidence?.source ?? "USD reference observations"}
        />
      ) : (
        <div className="ud-chart ud-chart-empty" role="status">
          <span>{pending ? "Loading chart…" : "Price feed paused"}</span>
        </div>
      )}
      {series.length < 2 && !history.isPending && (
        <button
          type="button"
          className="cg-chart-retry"
          onClick={() => {
            void history.refetch();
            void snapshot.refetch();
          }}
        >
          Retry
        </button>
      )}
      {snapshot.data?.stale && (
        <span className="block text-right text-[10px] text-amber-300" role="status">
          Delayed prices
        </span>
      )}
    </section>
  );
}
