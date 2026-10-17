import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { adminSectionSchema, adminSnapshotSchema } from "./admin-view";
import { missingSportsClauses } from "./market-templates.mjs";
import { createPublicClient, http, keccak256, parseAbi, stringToHex, type Address } from "viem";
import { base } from "viem/chains";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MARKET_IMAGE_BUCKET,
  MARKET_IMAGE_MAX_BASE64,
  MARKET_IMAGE_MAX_BYTES,
  decodeBase64,
  detectImage,
  hexOf,
  isImageFromProject,
  isManagedImageUrl,
  marketImageFileName,
} from "./market-image.mjs";
const documentSchema = z
  .object({
    title: z.string().min(5).max(200),
    description: z.string().min(20).max(12000),
    // The product has three sections. Football and Cricket are stored as Sports + subcategory.
    category: z.enum(["Crypto", "Sports"]),
    subcategory: z.enum(["Football", "Cricket"]).optional(),
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
    image: z
      .string()
      .refine(isManagedImageUrl, "Image must be uploaded through the admin image upload")
      .optional(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    if ((doc.category === "Sports") !== Boolean(doc.subcategory))
      ctx.addIssue({ code: "custom", message: "Choose Crypto, Football or Cricket." });
    // Sports rules must state what happens on postponed, abandoned, tied and no-result matches
    // before the market exists; the engine drafts do, and hand-written rules must too.
    if (doc.subcategory) {
      const missing = missingSportsClauses(doc.rules, doc.subcategory === "Football" ? "football" : "cricket");
      if (missing.length) ctx.addIssue({ code: "custom", message: `Rules must state ${missing.join("; ")}.` });
    }
  });
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
    return { allowed: !error && Boolean(data?.length), mfaRequired: context.claims.aal !== "aal2" };
  });
export const prepareNativeMarket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => documentSchema.parse(v))
  .handler(async ({ data, context }) => {
    if (context.claims.aal !== "aal2")
      throw Error("Administrator authenticator verification required");
    if (data.image && !isImageFromProject(data.image, process.env["SUPABASE_URL"] ?? ""))
      throw Error("Market image must come from TacPredict image storage.");
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

/**
 * Admin-only market picture upload. The browser sends a base64 PNG/JPEG/WebP (already resized);
 * the server re-checks role + authenticator, identifies the file by its bytes (never SVG), stores
 * it under a content hash in the public `market-images` bucket and returns the public URL that
 * goes into the locked market metadata. No database migration is involved.
 */
export const uploadMarketImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ data: z.string().min(16).max(MARKET_IMAGE_MAX_BASE64) }).strict().parse(v),
  )
  .handler(async ({ data, context }) => {
    if (context.claims.aal !== "aal2")
      throw Error("Administrator authenticator verification required");
    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    if (roleError || !roles?.length)
      throw Error("Only an assigned administrator may upload market images.");
    const bytes = decodeBase64(data.data);
    if (!bytes || bytes.length > MARKET_IMAGE_MAX_BYTES)
      throw Error("Image is invalid or larger than 1.5 MB.");
    const kind = detectImage(bytes);
    if (!kind) throw Error("Only PNG, JPEG or WebP images are accepted.");
    const name = marketImageFileName(
      hexOf(await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer)),
      kind.ext,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const upload = () =>
      supabaseAdmin.storage.from(MARKET_IMAGE_BUCKET).upload(name, bytes, {
        contentType: kind.mime,
        upsert: true,
        cacheControl: "31536000",
      });
    let result = await upload();
    if (result.error && /bucket not found/i.test(result.error.message)) {
      const created = await supabaseAdmin.storage.createBucket(MARKET_IMAGE_BUCKET, {
        public: true,
        fileSizeLimit: MARKET_IMAGE_MAX_BYTES,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
      });
      if (created.error && !/already exists/i.test(created.error.message))
        throw Error("Image storage is not available. Please try again.");
      result = await upload();
    }
    if (result.error) throw Error("Image upload failed. Please try again.");
    const url = supabaseAdmin.storage.from(MARKET_IMAGE_BUCKET).getPublicUrl(name).data.publicUrl;
    if (!isImageFromProject(url, process.env["SUPABASE_URL"] ?? ""))
      throw Error("Image storage returned an unexpected address.");
    try {
      await (supabaseAdmin as unknown as SupabaseClient)
        .from("protocol_audit_logs")
        .insert({ actor: context.userId, action: "MARKET_IMAGE_UPLOADED", target: name });
    } catch {
      /* the audit row is best effort; the upload itself is already content-addressed */
    }
    return { url };
  });

export const getProtocolAdminDeployments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (context.claims.aal !== "aal2")
      throw Error("Administrator authenticator verification required");
    const client = context.supabase as unknown as SupabaseClient;
    const role = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    if (role.error || !role.data?.length) throw Error("Assigned administrator required");
    const { data, error } = await client
      .from("protocol_deployments")
      .select("*")
      .eq("verified", true)
      .eq("chain_id", 8453);
    if (error) throw Error("Verified Base deployments unavailable");
    const { deploymentSchema } = await import("./types");
    return (data ?? []).map((d) =>
      deploymentSchema.parse({
        chainId: d.chain_id,
        collateral: d.collateral_token,
        registry: d.registry,
        factory: d.factory,
        positions: d.positions,
        exchange: d.exchange,
        oracle: d.oracle,
        settlement: d.settlement,
        tradingEnabled: d.trading_enabled,
        codeHashes: d.code_hashes,
      }),
    );
  });

export const getProtocolAdminSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ section: adminSectionSchema }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.claims.aal !== "aal2")
      throw Error("Administrator authenticator verification required");
    const client = context.supabase as unknown as SupabaseClient;
    const { data: snapshot, error } = await client.rpc("get_protocol_admin_snapshot", {
      _section: data.section,
    });
    if (error) throw Error("Administrator snapshot unavailable or permission denied");
    return adminSnapshotSchema.parse(snapshot);
  });

const liveRegistryAbi = parseAbi([
  "function tradingPaused() view returns(bool)",
  "function nextMarketId() view returns(uint256)",
]);
const liveOracleAbi = parseAbi([
  "function bond() view returns(uint256)",
  "function challengePeriod() view returns(uint64)",
]);

/**
 * Live Base Mainnet reads for the administrator Contracts/System views.
 * Observation only: this never signs, writes or changes any state, and any failed read is
 * reported as unavailable rather than as a default value.
 */
export const getProtocolLiveChainState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (context.claims.aal !== "aal2")
      throw Error("Administrator authenticator verification required");
    const client = context.supabase as unknown as SupabaseClient;
    const role = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    if (role.error || !role.data?.length) throw Error("Assigned administrator required");
    const { data: deployment, error } = await client
      .from("protocol_deployments")
      .select("registry, oracle, verified, chain_id")
      .eq("verified", true)
      .eq("chain_id", 8453)
      .maybeSingle();
    if (error || !deployment) throw Error("Verified Base deployment unavailable");
    const configured = process.env["BASE_PROTOCOL_RPC_URL"];
    const pub = createPublicClient({
      chain: base,
      transport: http(configured || "https://mainnet.base.org", { timeout: 8000, retryCount: 1 }),
    });
    const registry = deployment.registry as Address;
    const oracle = deployment.oracle as Address;
    const [block, paused, nextMarketId, bond, challengePeriod] = await Promise.allSettled([
      pub.getBlockNumber(),
      pub.readContract({ address: registry, abi: liveRegistryAbi, functionName: "tradingPaused" }),
      pub.readContract({ address: registry, abi: liveRegistryAbi, functionName: "nextMarketId" }),
      pub.readContract({ address: oracle, abi: liveOracleAbi, functionName: "bond" }),
      pub.readContract({ address: oracle, abi: liveOracleAbi, functionName: "challengePeriod" }),
    ]);
    const text = (r: PromiseSettledResult<bigint | number>) =>
      r.status === "fulfilled" ? r.value.toString() : null;
    return {
      chainId: 8453 as const,
      rpcSource: configured ? ("protocol" as const) : ("public" as const),
      observedAt: new Date().toISOString(),
      blockNumber: text(block),
      tradingPaused: paused.status === "fulfilled" ? Boolean(paused.value) : null,
      nextMarketId: text(nextMarketId),
      oracleBondAtomic: text(bond),
      challengePeriodSeconds: text(challengePeriod),
    };
  });
