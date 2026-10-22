import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { Address } from "viem";
import { POOL_DURATIONS } from "./pool.mjs";
import type { PoolAsset } from "./pool.mjs";

const asset = z.enum(["bitcoin", "ethereum", "solana", "bnb"]);
const minutes = z
  .number()
  .int()
  .refine((v) => POOL_DURATIONS.includes(v), "Unsupported duration");
const start = z.number().int().positive();
const user = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const getPoolConfig = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./pool.server")).poolConfig(),
);
export const getPoolRound = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => z.object({ asset, minutes, start }).strict().parse(v))
  .handler(async ({ data }) =>
    (await import("./pool.server")).poolRound(data.asset, data.minutes, data.start),
  );
export const getPoolPosition = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => z.object({ asset, minutes, start, user }).strict().parse(v))
  .handler(async ({ data }) =>
    (await import("./pool.server")).poolPosition(
      data.asset,
      data.minutes,
      data.start,
      data.user as Address,
    ),
  );
export const getPoolRecentPositions = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => z.object({ user }).strict().parse(v))
  .handler(async ({ data }) =>
    (await import("./pool.server")).poolRecentPositions(data.user as Address, Date.now()),
  );

export const poolConfigQueryOptions = queryOptions({
  queryKey: ["pool-config"],
  queryFn: () => getPoolConfig(),
  staleTime: 5000,
  refetchInterval: 15000,
  retry: 1,
});
export const poolRoundQueryOptions = (a: PoolAsset, m: number, s: number, enabled = true) =>
  queryOptions({
    queryKey: ["pool-round", a, m, s],
    queryFn: () => getPoolRound({ data: { asset: a, minutes: m, start: s } }),
    staleTime: 3000,
    refetchInterval: 6000,
    enabled,
    retry: 1,
  });
export const poolPositionQueryOptions = (a: PoolAsset, m: number, s: number, who: string | null) =>
  queryOptions({
    queryKey: ["pool-position", a, m, s, who],
    queryFn: () => getPoolPosition({ data: { asset: a, minutes: m, start: s, user: who ?? "" } }),
    staleTime: 3000,
    refetchInterval: 8000,
    enabled: Boolean(who),
    retry: 1,
  });
export const poolRecentQueryOptions = (who: string | null) =>
  queryOptions({
    queryKey: ["pool-recent", who],
    queryFn: () => getPoolRecentPositions({ data: { user: who ?? "" } }),
    staleTime: 10000,
    refetchInterval: 20000,
    enabled: Boolean(who),
    retry: 1,
  });

/** Bounded, finalized on-chain history; a clock row alone never implies a round exists. */
export const getPoolRoundHistory = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => z.object({ asset, minutes, before: start }).strict().parse(v))
  .handler(async ({ data }) =>
    (await import("./pool.server")).poolRoundHistory(data.asset, data.minutes, data.before),
  );
export const poolHistoryQueryOptions = (
  a: PoolAsset,
  m: number,
  before: number,
  enabled: boolean,
) =>
  queryOptions({
    queryKey: ["pool-history", a, m, before],
    queryFn: () => getPoolRoundHistory({ data: { asset: a, minutes: m, before } }),
    enabled: enabled && before > 0,
    staleTime: 15000,
    refetchInterval: 30000,
    retry: 1,
  });
