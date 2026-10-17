import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { UpDownAsset } from "@/lib/updown/window.mjs";

/**
 * Admin-only reads for the market engine. They only read provider data; nothing here writes to
 * the chain, changes a balance, finalizes a result or touches treasury funds.
 */
async function gate(context: { supabase: unknown; userId: string; claims: { aal?: string | undefined } }) {
  const { requireAdmin } = await import("@/lib/protocol/admin-users.server");
  await requireAdmin(context.supabase as unknown as SupabaseClient, context.userId, context.claims.aal);
}

export const getEngineProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await gate(context);
    return (await import("./providers.server")).providerInfo();
  });

export const getFixtures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ sport: z.enum(["football", "cricket"]), days: z.number().int().min(1).max(10).default(7) })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await gate(context);
    const server = await import("./providers.server");
    return data.sport === "football" ? server.loadFootballFixtures(data.days) : server.loadCricketFixtures();
  });

export const getSportsEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        sport: z.enum(["football", "cricket"]),
        matchId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
        closeMs: z.number().int().positive(),
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await gate(context);
    return (await import("./providers.server")).loadSportsResult(data.sport, data.matchId, data.closeMs);
  });

export const getCryptoEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        asset: z.enum(["bitcoin", "ethereum", "solana", "bnb"]),
        startMs: z.number().int().positive(),
        minutes: z.number().int().min(5).max(1440),
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await gate(context);
    return (await import("./providers.server")).loadCryptoEvidence(data.asset as UpDownAsset, data.startMs, data.minutes);
  });

export const engineProvidersQuery = queryOptions({
  queryKey: ["engine-providers"],
  queryFn: () => getEngineProviders(),
  staleTime: 60000,
  retry: 0,
});
export const fixturesQuery = (sport: "football" | "cricket", days = 7) =>
  queryOptions({
    queryKey: ["engine-fixtures", sport, days],
    queryFn: () => getFixtures({ data: { sport, days } }),
    staleTime: 60000,
    retry: 0,
  });
