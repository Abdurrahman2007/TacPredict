import { publicVirtualBoundary } from "./errors";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Address, Hex } from "viem";
import { z } from "zod";
const wallet = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const atomic = z.string().regex(/^\d{1,20}$/);
const intent = z.object({
  wallet,
  marketId: atomic,
  outcome: z.number().int().min(0).max(2),
  isBuy: z.boolean(),
  input: atomic,
  nonce: z.string().regex(/^\d{1,78}$/),
});
export const getVirtualCatalogue = createServerFn({ method: "GET" }).handler(async () => {
  return publicVirtualBoundary(async () => {
    const { readVirtualCatalogue } = await import("./read.server");
    return readVirtualCatalogue();
  });
});
export const getVirtualAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ wallet }).parse(v))
  .handler(async ({ data, context }) => {
    return publicVirtualBoundary(async () => {
      const { ownsWallet } = await import("./database.server");
      await ownsWallet(context.supabase as unknown as SupabaseClient, context.userId, data.wallet);
      const { readVirtualAccount } = await import("./read.server");
      return readVirtualAccount(data.wallet as Address);
    });
  });
export const prepareVirtual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => intent.omit({ nonce: true }).parse(v))
  .handler(async ({ data, context }) => {
    return publicVirtualBoundary(async () => {
      const { ownsWallet } = await import("./database.server");
      await ownsWallet(context.supabase as unknown as SupabaseClient, context.userId, data.wallet);
      const { prepareVirtualTrade } = await import("./trade.server");
      return prepareVirtualTrade(
        data.wallet as Address,
        data.marketId,
        data.outcome,
        data.isBuy,
        data.input,
      );
    });
  });
export const observeVirtual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/), intent }).parse(v),
  )
  .handler(async ({ data, context }) => {
    return publicVirtualBoundary(async () => {
      const { ownsWallet } = await import("./database.server");
      await ownsWallet(
        context.supabase as unknown as SupabaseClient,
        context.userId,
        data.intent.wallet,
      );
      const { observeVirtualTrade } = await import("./trade.server");
      return observeVirtualTrade(data.hash as Hex, {
        ...data.intent,
        wallet: data.intent.wallet as Address,
      });
    });
  });
export const advanceVirtualIndexer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return publicVirtualBoundary(async () => {
      if (context.claims.aal !== "aal2") throw Error("Administrator MFA required");
      const r = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "admin");
      if (r.error || !r.data?.length) throw Error("Administrator required");
      const { virtualDb } = await import("./database.server");
      const requested = await virtualDb.from("virtual_admin_audit").insert({
        actor: context.userId,
        action: "indexer.advance.requested",
        details: { maxBlocks: 16 },
      });
      if (requested.error) throw Error("Audit trail unavailable; indexer not advanced");
      const { runVirtualIndexer } = await import("./indexer.server");
      const result = await runVirtualIndexer(16);
      const completed = await virtualDb
        .from("virtual_admin_audit")
        .insert({ actor: context.userId, action: "indexer.advance.completed", details: result });
      if (completed.error) throw Error("Indexer ran; completion audit needs reconciliation");
      return result;
    });
  });
export const getVirtualOperations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return publicVirtualBoundary(async () => {
      if (context.claims.aal !== "aal2") throw Error("Administrator MFA required");
      const role = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "admin");
      if (role.error || !role.data?.length) throw Error("Administrator required");
      const { virtualConfig } = await import("./runtime.server");
      if (!virtualConfig()) return { configured: false as const };
      const { virtualOperations } = await import("./operations.server");
      return virtualOperations();
    });
  });
