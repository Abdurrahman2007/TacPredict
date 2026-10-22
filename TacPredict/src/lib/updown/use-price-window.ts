import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cryptoHistoryQueryOptions, cryptoMarketQueryOptions } from "@/lib/market-data.functions";
import {
  boundaryObservation,
  chartWindow,
  referenceChartView,
  referenceObservation,
  mergeObservedCandles,
} from "./chart-window.mjs";
import { useLivePrice } from "./live-prices";
import { spotWindowQueryOptions } from "./spot.functions";
import { priceToBeat, seriesForWindow, thin, type UpDownAsset, type Win } from "./window.mjs";

/** Source-coherent real chart observations; never replace a pool's reported settlement prices. */
export function usePriceWindow(asset: UpDownAsset, selected: Win, now = Date.now(), dense = true) {
  const snapshot = useQuery(cryptoMarketQueryOptions);
  const history = useQuery(cryptoHistoryQueryOptions(asset));
  const lookback = Math.min(
    18000,
    Math.max(
      120,
      selected.minutes,
      Math.ceil(Math.max(0, now - selected.start) / 3600000) * 60 + 60,
    ),
  );
  const spot = useQuery({
    ...spotWindowQueryOptions(asset, lookback, 15000),
    enabled: dense && now > 0,
  });
  const live = useLivePrice(asset, dense);
  const view = useMemo(() => {
    const useSpot = dense && Boolean(spot.data?.candles.length);
    const points = useSpot
      ? seriesForWindow({
          candles: spot.data?.candles,
          trades: spot.data?.trades,
          ticks: live.ticks,
          w: { start: now - lookback * 60000, end: Math.min(now, selected.end), minutes: lookback },
          nowMs: now,
          gran: (spot.data?.granularity ?? 60) * 1000,
        })
      : [...(history.data ?? []), ...(snapshot.data?.histories[asset] ?? [])];
    const shown = referenceChartView(points, selected, now);
    return {
      ...shown,
      series: thin(shown.series, 600),
      boundary: useSpot
        ? priceToBeat(spot.data?.candles, selected.start, (spot.data?.granularity ?? 60) * 1000)
        : referenceObservation(points, selected.start, now),
      endPrice: boundaryObservation(points, selected.end, now),
      candles: useSpot
        ? mergeObservedCandles(
            spot.data?.candles ?? [],
            live.ticks,
            (spot.data?.granularity ?? 60) * 1000,
            spot.data?.fetchedAt ?? now,
            now,
          ).filter((c) => c.time >= shown.range.start && c.time <= Math.min(now, selected.end))
        : undefined,
      source: useSpot ? "Coinbase USD observations" : "Sampled USD reference observations",
      hasWindowData: chartWindow(points, selected.start, Math.min(now, selected.end)).length > 0,
    };
  }, [dense, spot.data, live.ticks, lookback, history.data, snapshot.data, asset, selected, now]);
  return {
    ...view,
    snapshot,
    history,
    spot,
    pending: dense ? spot.isPending && snapshot.isPending : snapshot.isPending || history.isPending,
  };
}
