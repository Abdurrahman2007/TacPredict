import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { UpDownAsset } from "./window.mjs";

const assetSchema = z.enum(["bitcoin", "ethereum", "solana", "bnb"]);

/** Real Coinbase one-minute candles and recent trades for the chart and price-to-beat. */
export const getSpotWindowData = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) =>
    z
      .object({ asset: assetSchema, minutes: z.number().int().min(5).max(18000) })
      .strict()
      .parse(v),
  )
  .handler(async ({ data }) =>
    (await import("./spot.server")).spotWindowData(data.asset, data.minutes),
  );

/** Latest price per asset; used when the live socket is not connected. */
export const getSpotTickers = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./spot.server")).spotTickers(),
);

export const spotWindowQueryOptions = (asset: UpDownAsset, minutes: number, refetchMs = 5000) =>
  queryOptions({
    queryKey: ["spot-window", asset, minutes],
    queryFn: () => getSpotWindowData({ data: { asset, minutes } }),
    staleTime: 2000,
    refetchInterval: refetchMs,
    refetchIntervalInBackground: false,
    retry: 1,
  });

export const spotTickersQueryOptions = queryOptions({
  queryKey: ["spot-tickers"],
  queryFn: () => getSpotTickers(),
  staleTime: 2000,
  retry: 1,
});

/** Independently cached public reference OHLC; never used as settlement evidence. */
export const getReferenceWindowData = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) =>
    z
      .object({
        asset: assetSchema,
        minutes: z.number().int().min(5).max(18000),
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ data }) =>
    (await import("./reference.server")).referenceWindowData(data.asset, data.minutes),
  );

export const referenceWindowQueryOptions = (asset: UpDownAsset, minutes: number) =>
  queryOptions({
    queryKey: ["reference-window", asset, minutes],
    queryFn: () => getReferenceWindowData({ data: { asset, minutes } }),
    staleTime: 20000,
    refetchInterval: 20000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
