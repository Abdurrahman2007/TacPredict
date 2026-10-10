import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { signedOrderSchema } from "./orders";
export const submitProtocolOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        chainId: z.union([z.literal(8453), z.literal(84532)]),
        marketUuid: z.string().uuid(),
        order: signedOrderSchema,
        signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { saveVerifiedOrder } = await import("./orders.server");
    return saveVerifiedOrder(data, context.userId);
  });
