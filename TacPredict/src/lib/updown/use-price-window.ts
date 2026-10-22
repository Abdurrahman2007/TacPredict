import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cryptoHistoryQueryOptions, cryptoMarketQueryOptions } from "@/lib/market-data.functions";
import { boundaryObservation, chartView, referenceObservation } from "./chart-window.mjs";
import type { UpDownAsset, Win } from "./window.mjs";

/** One deduplicated provider feed for the card and detail; no interpolated boundary prices. */
export function usePriceWindow(asset: UpDownAsset, selected: Win, now = Date.now()) {
  const snapshot = useQuery(cryptoMarketQueryOptions);
  const history = useQuery(cryptoHistoryQueryOptions(asset));
  const view = useMemo(() => {
    const points = [...(history.data ?? []), ...(snapshot.data?.histories[asset] ?? [])];
    return {
      ...chartView(points, selected, now),
      boundary: referenceObservation(points, selected.start, now),
      endPrice: boundaryObservation(points, selected.end, now),
    };
  }, [history.data, snapshot.data, asset, selected, now]);
  return { ...view, snapshot, history, pending: snapshot.isPending || history.isPending };
}
