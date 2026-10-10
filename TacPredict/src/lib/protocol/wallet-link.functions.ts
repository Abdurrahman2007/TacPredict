import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
export const getWalletLinkChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { challenge } = await import("./wallet-link.server");
    return challenge(context.userId, data.address);
  });
export const proveWalletLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ id: z.string().uuid(), signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/) })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { prove } = await import("./wallet-link.server");
    return prove(context.userId, data.id, data.signature);
  });
