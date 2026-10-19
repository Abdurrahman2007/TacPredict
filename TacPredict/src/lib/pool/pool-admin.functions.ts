import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanCopy } from "./series-copy.mjs";

const asset = z.enum(["bitcoin", "ethereum", "solana", "bnb"]);

/** Public: titles and descriptions the administrator saved for each asset. */
export const getSeriesCopy = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./series-copy.server")).readSeriesCopy(),
);
export const seriesCopyQueryOptions = queryOptions({
  queryKey: ["pool-series-copy"],
  queryFn: () => getSeriesCopy(),
  staleTime: 15000,
  retry: 1,
});

/** Administrator with authenticator verification only. Changes text, never money. */
export const saveSeriesCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ asset, title: z.string().max(200), description: z.string().max(1000) }).strict().parse(v),
  )
  .handler(async ({ data, context }) => {
    if (context.claims.aal !== "aal2") throw Error("Administrator authenticator verification required");
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    if (error || !roles?.length) throw Error("Only an assigned administrator may change market text.");
    const clean = cleanCopy({ title: data.title, description: data.description });
    if ("error" in clean) throw Error(clean.error);
    await (await import("./series-copy.server")).writeSeriesCopy(data.asset, clean);
    return { ok: true as const, title: clean.title, description: clean.description };
  });

/** Public chain facts the admin desk needs: who holds the reporter role and whether it has gas. */
export const getPoolRoleStatus = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) =>
    z.object({ who: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).strict().parse(v),
  )
  .handler(async ({ data }) => (await import("./pool.server")).poolRoleStatus(data.who as `0x${string}`));
