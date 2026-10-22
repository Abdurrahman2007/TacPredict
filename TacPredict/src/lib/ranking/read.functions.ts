import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const wallet = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((v) => v.toLowerCase());
const input = z
  .object({
    period: z.enum(["1d", "7d", "30d", "all"]).default("30d"),
    page: z.number().int().min(0).max(399).default(0),
    trader: wallet.optional(),
    wallet: wallet.optional(),
  })
  .strict();
export const getRanking = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => input.parse(v))
  .handler(async ({ data }) => {
    try {
      const { readRanking } = await import("./read.server");
      return await readRanking(data);
    } catch {
      return {
        status: "unavailable" as const,
        rows: [],
        total: 0,
        selected: null,
        self: null,
        observedAt: null,
      };
    }
  });
export const getAdminRanking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => input.parse(v))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/protocol/admin-users.server");
    await requireAdmin(
      context.supabase as unknown as SupabaseClient,
      context.userId,
      context.claims.aal,
    );
    const { readRanking } = await import("./read.server");
    return readRanking(data);
  });
export const rankingOptions = (data: z.input<typeof input>) =>
  queryOptions({
    queryKey: ["ranking", data],
    queryFn: () => getRanking({ data }),
    staleTime: 30000,
    refetchInterval: 60000,
    retry: 0,
  });
export const adminRankingOptions = (period: "1d" | "7d" | "30d" | "all") =>
  queryOptions({
    queryKey: ["admin-ranking", period],
    queryFn: () => getAdminRanking({ data: { period, page: 0 } }),
    staleTime: 30000,
    retry: 0,
  });
