import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const access = async (c: { supabase: unknown; userId: string; claims: { aal?: string } }) => {
  const { requireAdmin } = await import("./admin-users.server");
  await requireAdmin(c.supabase as SupabaseClient, c.userId, c.claims.aal);
};
export const getAdminMarketCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        page: z.number().int().min(0).max(9999),
        filter: z.enum(["all", "open", "closed"]),
        search: z.string().max(100),
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    await access(context);
    const s = await import("./admin-dashboard.server");
    return s.loadMarketCards(data.page, data.filter, data.search);
  });
export const getAdminMarketCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await access(context);
    const s = await import("./admin-dashboard.server");
    return s.loadMarketCounts();
  });
export const getAdminTreasuryBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await access(context);
    const s = await import("./admin-dashboard.server");
    return s.loadTreasuryBalance();
  });
export const getAdminUserDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ userId: z.string().uuid() }).strict().parse(v))
  .handler(async ({ context, data }) => {
    await access(context);
    const s = await import("./admin-dashboard.server");
    return s.loadUserDetails(data.userId);
  });
export const adminMarketCountsOptions = queryOptions({
  queryKey: ["admin-market-counts"],
  queryFn: () => getAdminMarketCounts(),
  retry: 0,
  staleTime: 30000,
});
export const adminTreasuryOptions = queryOptions({
  queryKey: ["admin-treasury-balance"],
  queryFn: () => getAdminTreasuryBalance(),
  retry: 0,
  staleTime: 60000,
});
