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

/** Unsigned captureStart / proposeFromFeed / finalize plan. Never signs. */
export const planVirtualOperator = createServerFn({ method: "GET" })
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
      const { planVirtualOperatorActions } = await import("./operator.server");
      return planVirtualOperatorActions();
    });
  });

// Review-only campaign preview/save. Never signs, configures an onchain campaign or grants balances.
export const previewVirtualCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        saveDraft: z.boolean().default(false),
        version: z.number().int().min(1),
        draft: z
          .object({
            month: z.string(),
            startsAt: z.number().int(),
            endsAt: z.number().int(),
            eligibility: z.string().min(1).max(4000),
            budget: atomic,
            maxPerWallet: atomic,
            allocations: z
              .array(z.object({ wallet, amount: atomic }).strict())
              .min(1)
              .max(10000),
          })
          .strict(),
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) =>
    publicVirtualBoundary(async () => {
      if (context.claims.aal !== "aal2") throw Error("Administrator MFA required");
      const role = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "admin");
      if (role.error || !role.data?.length) throw Error("Administrator required");
      const { virtualRuntime } = await import("./runtime.server");
      const r = await virtualRuntime();
      if (r.deployment.model !== "feed-v1")
        throw Error("This deployment does not support scheduled, pausable monthly campaigns");
      const { virtualPriceAmmAbi } = await import("./price-abi");
      const [count, budget, reserved] = await Promise.all(
        ["campaignCount", "grantBudget", "campaignBudgetReserved"].map((functionName) =>
          r.client.readContract({
            address: r.deployment.engine,
            abi: virtualPriceAmmAbi,
            functionName: functionName as
              "campaignCount" | "grantBudget" | "campaignBudgetReserved",
          }),
        ),
      );
      if (count === undefined || budget === undefined || reserved === undefined)
        throw Error("Campaign capacity unavailable");
      const { previewCampaign } = await import("./campaign");
      const preview = previewCampaign(
        data.draft,
        r.deployment.engine,
        r.deployment.chainId,
        (count + 1n).toString(),
        Math.floor(Date.now() / 1000),
      );
      if (BigInt(preview.budget) > budget - reserved)
        throw Error("Insufficient immutable contract grant capacity");
      let draftId: string | null = null;
      if (data.saveDraft) {
        const { virtualDb } = await import("./database.server");
        const saved = await virtualDb.rpc("virtual_save_campaign_draft", {
          _deployment: r.deployment.id,
          _month: data.draft.month + "-01",
          _version: data.version,
          _config: { ...preview, eligibility: data.draft.eligibility },
          _actor: context.userId,
        });
        if (saved.error) throw Error("Campaign draft/audit could not be saved");
        draftId = String(saved.data);
      }
      return {
        preview,
        draftId,
        notice:
          "Draft only. Rebuild against current campaign ID before any approved onchain publication.",
      };
    }),
  );
