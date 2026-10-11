import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
export const previewSchema = z.object({
  id: z.string().startsWith("preview-"),
  asset: z.enum(["bitcoin", "ethereum", "solana"]),
  title: z.string().max(200),
  category: z.literal("Crypto"),
  closeAt: z.string(),
  rules: z.string(),
  sourceUrl: z.string().url(),
  observedPrice: z.number().positive(),
  observedAt: z.string(),
  referenceProvider: z.literal("CoinGecko"),
  status: z.literal("PREVIEW"),
  chainId: z.literal(8453),
  collateral: z.literal("USDC"),
});
export type MarketPreview = z.infer<typeof previewSchema>;
export const getMarketPreviews = createServerFn({ method: "GET" }).handler(async () => {
  const { readProtocolRpc } = await import("@/lib/protocol/read.server");
  return z
    .array(previewSchema)
    .max(3)
    .parse(await readProtocolRpc("get_market_previews"));
});
export const marketPreviewsQueryOptions = queryOptions({
  queryKey: ["own-market-previews", "v1"],
  queryFn: () => getMarketPreviews(),
  staleTime: 300000,
  gcTime: 1800000,
  refetchInterval: 300000,
  retry: 0,
  refetchOnWindowFocus: false,
});
const stateSchema = z.object({
  policy: z.object({
    discovery_enabled: z.boolean(),
    auto_publish: z.literal(false),
    last_success_at: z.string().nullable(),
    last_error: z.string().nullable(),
    page_offset: z.number(),
  }),
  counts: z.object({
    discovered: z.number(),
    rejected: z.number(),
    reviewRequired: z.number(),
    previews: z.number(),
    published: z.literal(0),
  }),
  runs: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      started_at: z.string(),
      ai_reviewed: z.boolean(),
    }),
  ),
  candidates: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      title: z.string(),
      status: z.string(),
      category: z.string(),
      source_url: z.string().url(),
      proposed_rules: z.string(),
      validation: z.object({
        reasons: z.array(z.string()).optional(),
        aiReview: z
          .object({
            clear: z.boolean().optional(),
            reason: z.string().optional(),
            model: z.string().optional(),
            unavailable: z.boolean().optional(),
          })
          .nullable()
          .optional(),
      }),
    }),
  ),
});
export const getMarketImportAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (context.claims.aal !== "aal2") throw Error("Admin MFA required");
    const c = context.supabase as unknown as SupabaseClient;
    const { data, error } = await c.rpc("get_market_import_admin");
    if (error) throw Error("Assigned admin with MFA required");
    return stateSchema.parse(data);
  });
export const setMarketImportEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ enabled: z.boolean() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.claims.aal !== "aal2") throw Error("Admin MFA required");
    const { error } = await (context.supabase as unknown as SupabaseClient).rpc(
      "set_market_import_enabled",
      { _enabled: data.enabled },
    );
    if (error) throw Error("Importer policy update denied");
    return true;
  });
export const reviewMarketCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ id: z.string().uuid(), reject: z.boolean() }).strict().parse(v),
  )
  .handler(async ({ data, context }) => {
    if (context.claims.aal !== "aal2") throw Error("Admin MFA required");
    const { data: changed, error } = await (context.supabase as unknown as SupabaseClient).rpc(
      "review_market_candidate",
      { _id: data.id, _reject: data.reject },
    );
    if (error || !changed) throw Error("Candidate review denied");
    return true;
  });
