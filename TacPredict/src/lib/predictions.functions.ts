import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// Legacy points-based prediction execution is deliberately disabled.
export const placePrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => v)
  .handler(async () => ({
    ok: false as const,
    message:
      "Native USDC predictions require signed on-chain orders. TAC balances cannot fund this protocol.",
  }));
