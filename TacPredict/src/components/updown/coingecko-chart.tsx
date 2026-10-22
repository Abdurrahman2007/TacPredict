import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cryptoHistoryQueryOptions, cryptoMarketQueryOptions } from "@/lib/market-data.functions";
import { chartView } from "@/lib/updown/chart-window.mjs";
import { ASSETS, deltaInfo, formatUsd, type UpDownAsset, type Win } from "@/lib/updown/window.mjs";
import { clock, useTimeZone } from "@/lib/updown/use-clock";
import { UpDownChart } from "./updown-chart";

/** Sampled prices, not tick-by-tick. Chart data never changes locked settlement evidence. */
export function CoinGeckoChart({
  asset,
  window: selected,
  summary = false,
}: {
  asset: UpDownAsset;
  window: Win;
  summary?: boolean;
}) {
  const snapshot = useQuery(cryptoMarketQueryOptions);
  const history = useQuery(cryptoHistoryQueryOptions(asset));
  const zone = useTimeZone();
  const view = useMemo(
    () =>
      chartView(
        [...(history.data ?? []), ...(snapshot.data?.histories[asset] ?? [])],
        selected,
        Date.now(),
      ),
    [history.data, snapshot.data, asset, selected.start, selected.end],
  );
  const { series, range, mode } = view;
  const first = series[0];
  const last = series.at(-1);
  const delta = deltaInfo(last?.price, first?.price);
  return (
    <section className="cg-chart" aria-label={`${ASSETS[asset].name} CoinGecko chart`}>
      {summary && (
        <dl className="tp-price-summary">
          <div>
            <dt title="First displayed CoinGecko observation; not the locked settlement price">
              {mode === "recent" ? "History start" : "Reference"}
            </dt>
            <dd>{first ? formatUsd(first.price, asset) : "Unavailable"}</dd>
          </div>
          <div>
            <dt className="tp-current">{mode === "recent" ? "Latest" : "Now"}</dt>
            <dd className="tp-current">
              {last ? formatUsd(last.price, asset) : "Unavailable"}
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
      {mode === "recent" && series.length > 1 && (
        <div className="cg-chart-context" aria-label="Displayed chart time range">
          <span>Recent price history</span>
          <span>
            {clock(range.start, zone)} – {clock(range.end, zone)}
          </span>
        </div>
      )}
      {series.length ? (
        <UpDownChart
          w={range}
          series={series}
          compact={summary}
          beat={null}
          asset={asset}
          live={false}
          source="CoinGecko"
        />
      ) : (
        <div className="ud-chart ud-chart-empty" role="status">
          <span>
            {history.isPending || snapshot.isPending
              ? "Loading chart…"
              : "Price history temporarily unavailable"}
          </span>
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
          Reload chart
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
