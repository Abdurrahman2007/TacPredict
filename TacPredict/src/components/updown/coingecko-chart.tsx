import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  cryptoHistoryQueryOptions,
  cryptoMarketQueryOptions,
  type PricePoint,
} from "@/lib/market-data.functions";
import { ASSETS, formatUsd, type UpDownAsset, type Win } from "@/lib/updown/window.mjs";
import { UpDownChart } from "./updown-chart";

/** CoinGecko observations are display data, never fabricated candles or settlement evidence. */
export function CoinGeckoChart({ asset, window: selected }: { asset: UpDownAsset; window: Win }) {
  const snapshot = useQuery(cryptoMarketQueryOptions);
  const history = useQuery(cryptoHistoryQueryOptions(asset));
  const points = useMemo(() => {
    const all = [...(history.data ?? []), ...(snapshot.data?.histories[asset] ?? [])];
    return [
      ...new Map(
        all.filter((p) => Number.isFinite(p.time) && p.price > 0).map((p) => [p.time, p]),
      ).values(),
    ].sort((a, b) => a.time - b.time);
  }, [history.data, snapshot.data, asset]);
  const inWindow = points.filter((p) => p.time >= selected.start && p.time <= selected.end);
  const exactWindow = inWindow.length >= 2;
  const series: PricePoint[] = exactWindow ? inWindow : points;
  const last = series.at(-1);
  const first = series[0];
  const range: Win = exactWindow
    ? selected
    : {
        start: first?.time ?? selected.start,
        end: Math.max(last?.time ?? selected.end, (first?.time ?? selected.start) + 1000),
        minutes: 1440,
      };
  const unavailable = !points.length && (history.isError || snapshot.isError);
  return (
    <section className="cg-chart" aria-label={`${ASSETS[asset].name} CoinGecko chart`}>
      <div className="cg-chart-heading">
        <span>CoinGecko · {exactWindow ? "Selected window" : "Recent history"}</span>
        <strong>{last ? formatUsd(last.price, asset) : "$0"}</strong>
      </div>
      {series.length ? (
        <UpDownChart w={range} series={series} beat={null} asset={asset} live={false} />
      ) : (
        <div className="ud-chart ud-chart-empty" role="status">
          {unavailable ? "CoinGecko data unavailable" : "Loading CoinGecko history…"}
        </div>
      )}
      {!exactWindow && points.length > 0 && (
        <p className="cg-chart-note">Recent history shown: too few samples in this window.</p>
      )}
      <details className="cg-chart-note">
        <summary>CoinGecko samples · Source details</summary>
        <p>
          Sampled prices, not tick-by-tick. {snapshot.data?.stale ? "Delayed provider data. " : ""}
          Settlement follows the market’s locked oracle rules, never this chart. Coinbase oracle and
          CoinGecko prices can differ.
        </p>
        {last && (
          <p>
            Last sample:{" "}
            <time dateTime={new Date(last.time).toISOString()}>
              {new Date(last.time).toISOString().slice(11, 19)} UTC
            </time>
          </p>
        )}
      </details>
      {unavailable && (
        <button
          type="button"
          className="ud-pill"
          onClick={() => {
            void history.refetch();
            void snapshot.refetch();
          }}
        >
          Retry CoinGecko
        </button>
      )}
    </section>
  );
}
