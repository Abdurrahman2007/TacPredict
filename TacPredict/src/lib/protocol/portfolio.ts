import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { validMarketIdentity } from "./market-identity.mjs";
const atomic = z.string().regex(/^\d+$/);
const portfolioSchema = z.object({
  positions: z.array(
    z
      .object({
        id: z.string(),
        marketId: z.string(),
        onchainId: atomic,
        chainId: z.number(),
        title: z.string(),
        status: z.string(),
        positionStatus: z.string(),
        outcome: z.string(),
        outcomeIndex: z.number(),
        tokenId: atomic.nullable(),
        wallet: z.string(),
        sharesAtomic: atomic,
        lastPriceAtomic: atomic.nullable(),
        valueAtomic: atomic.nullable(),
        claimableAtomic: atomic,
        updatedAt: z.string(),
      })
      .refine(validMarketIdentity, "Market DB/on-chain identity mismatch"),
  ),
});
export function useNativePortfolio() {
  const { user } = useProtocolUser();
  return useQuery({
    queryKey: ["native-portfolio", user?.id ?? "signed-out"],
    enabled: Boolean(user),
    queryFn: async () => {
      const client = supabase as unknown as SupabaseClient;
      const registered = await client.rpc("register_my_protocol_wallet");
      if (registered.error) throw Error("Verified wallet link is unavailable.");
      const { data, error } = await client.rpc("get_my_protocol_portfolio");
      if (error) throw Error("Native portfolio is temporarily unavailable.");
      const activity = await client.rpc("get_my_protocol_activity");
      return {
        ...portfolioSchema.parse(data),
        walletLinked: Boolean(registered.data),
        activity: activity.error
          ? null
          : z
              .array(
                z.object({
                  id: z.string(),
                  kind: z.string(),
                  title: z.string(),
                  marketId: z.string(),
                  amountAtomic: atomic,
                  txHash: z.string(),
                  chainId: z.number(),
                  timestamp: z.string(),
                }),
              )
              .parse(activity.data),
      };
    },
    staleTime: 15000,
    refetchInterval: 30000,
    retry: 0,
  });
}
