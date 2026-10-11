import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useProtocolUser } from "./use-auth-user";
import { signedOrderSchema } from "./orders";
import { remainingShares } from "./portfolio-view.mjs";
const rowSchema = z.object({
  order_id: z.string(),
  status: z.enum(["OPEN", "PARTIAL", "FILLED", "CANCELLED", "EXPIRED"]),
  filled_atomic: z.string().regex(/^\d+$/),
  signed_order: signedOrderSchema,
  created_at: z.string(),
  expiration: z.string(),
  protocol_markets: z.object({
    title: z.string(),
    api_market_id: z.string(),
    chain_id: z.literal(8453),
  }),
});
export function useOwnProtocolOrders() {
  const { user } = useProtocolUser();
  return useQuery({
    queryKey: ["own-base-orders", user?.id ?? "signed-out"],
    enabled: Boolean(user),
    retry: 0,
    staleTime: 15000,
    refetchInterval: 30000,
    queryFn: async () => {
      if (!user) return [];
      // Authenticated browser session + Own signed orders RLS. No service-role credential.
      const db = supabase as unknown as SupabaseClient;
      const { data, error } = await db
        .from("protocol_orders")
        .select(
          "order_id,status,filled_atomic::text,signed_order,created_at,expiration,protocol_markets!inner(title,api_market_id,chain_id)",
        )
        .eq("user_id", user.id)
        .eq("protocol_markets.chain_id", 8453)
        .in("status", ["OPEN", "PARTIAL"])
        .gt("expiration", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw Error("Open orders are temporarily unavailable.");
      return z
        .array(rowSchema)
        .parse(data)
        .map((row) => ({
          id: row.order_id,
          title: row.protocol_markets.title,
          marketId: row.protocol_markets.api_market_id,
          side: row.signed_order.isBuy ? "BUY" : "SELL",
          outcomeIndex: row.signed_order.outcome,
          priceAtomic: row.signed_order.price,
          remainingAtomic: remainingShares(row.signed_order.shares, row.filled_atomic),
          status: row.status,
          createdAt: row.created_at,
          expiration: row.expiration,
        }))
        .filter((o) => BigInt(o.remainingAtomic) > 0n);
    },
  });
}
