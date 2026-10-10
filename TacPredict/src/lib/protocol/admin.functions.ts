import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { keccak256, stringToHex } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
const documentSchema = z
  .object({
    title: z.string().min(5).max(200),
    description: z.string().min(20).max(12000),
    category: z.enum(["Crypto", "Sports", "News", "Technology", "Business", "Culture", "Other"]),
    outcomes: z
      .array(z.string().min(1).max(80))
      .min(2)
      .max(8)
      .refine((values) => new Set(values).size === values.length, "Outcome labels must be unique"),
    rules: z.string().min(20).max(12000),
    source: z.string().min(3).max(200),
    sourceUrl: z
      .string()
      .url()
      .refine((v) => v.startsWith("https://")),
    tags: z.array(z.string().max(40)).max(20).default([]),
  })
  .strict();
function canonical(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical((v as Record<string, unknown>)[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
export const getProtocolAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    return { allowed: !error && Boolean(data?.length) };
  });
export const prepareNativeMarket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => documentSchema.parse(v))
  .handler(async ({ data, context }) => {
    const document = canonical(data);
    const metadataHash = keccak256(stringToHex(document));
    const rulesHash = keccak256(stringToHex(data.rules));
    const sourceHash = keccak256(
      stringToHex(canonical({ source: data.source, sourceUrl: data.sourceUrl })),
    );
    const client = context.supabase as unknown as SupabaseClient;
    const { error } = await client.rpc("prepare_protocol_market", {
      _hash: metadataHash,
      _rules_hash: rulesHash,
      _source_hash: sourceHash,
      _document: data,
    });
    if (error) throw Error("Only an assigned administrator may prepare market terms.");
    return {
      metadataHash,
      rulesHash,
      sourceHash,
      metadataUri: `https://tacpredict.fun/api/protocol/metadata/${metadataHash}`,
      document,
    };
  });
