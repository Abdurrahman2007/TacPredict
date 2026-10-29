import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";

/** Live TAC points balance from profiles.balance (account points ledger). */
export function useTacPointsBalance() {
  const { user, ready } = useProtocolUser();
  return useQuery({
    queryKey: ["tac-points-balance", user?.id ?? "signed-out"],
    enabled: ready && Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("balance, streak")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw Error("TAC points unavailable");
      return {
        balance: typeof data?.balance === "number" ? data.balance : 0,
        streak: typeof data?.streak === "number" ? data.streak : 0,
      };
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}
