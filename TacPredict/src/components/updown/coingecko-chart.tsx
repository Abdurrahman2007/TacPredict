import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cryptoHistoryQueryOptions, cryptoMarketQueryOptions } from "@/lib/market-data.functions";
import { chartWindow } from "@/lib/updown/chart-window.mjs";
import { ASSETS, deltaInfo, formatUsd, type UpDownAsset, type Win } from "@/lib/updown/window.mjs";
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
  const series = useMemo(
    () =>
      chartWindow(
        [...(history.data ?? []), ...(snapshot.data?.histories[asset] ?? [])],
        selected.start,
        Math.min(selected.end, Date.now()),
      ),
    [history.data, snapshot.data, asset, selected.start, selected.end],
  );
  const first = series[0];
  const last = series.at(-1);
  const delta = deltaInfo(last?.price, first?.price);
  return (
    <section className="cg-chart" aria-label={`${ASSETS[asset].name} CoinGecko chart`}>
      {summary && (
        <dl className="tp-price-summary">
          <div>
            <dt title="First CoinGecko observation in this window; not the locked settlement price">
              Reference
            </dt>
            <dd>{first ? formatUsd(first.price, asset) : "$0"}</dd>
          </div>
          <div>
            <dt className="tp-current">Now</dt>
            <dd className="tp-current">
              {last ? formatUsd(last.price, asset) : "$0"}
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
          w={series.length > 1 ? { ...selected, start: first!.time, end: last!.time } : selected}
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
              : "No samples in this window"}
          </span>
        </div>
      )}
    </section>
  );
}
