import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { signedOrderSchema, signatureSchema } from "./orders";
export const submitProtocolOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        chainId: z.union([z.literal(8453), z.literal(84532)]),
        marketUuid: z.string().uuid(),
        order: signedOrderSchema,
        signature: signatureSchema,
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { rejectRealAssetTrading } = await import("@/lib/virtual/product-policy");
    rejectRealAssetTrading();
    const { saveVerifiedOrder } = await import("./orders.server");
    return saveVerifiedOrder(data, context.userId);
  });
