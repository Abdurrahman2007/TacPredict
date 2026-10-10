import { z } from "zod";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
export type RewardTasks = {
  ok: boolean;
  account_created: boolean;
  x_connected: boolean;
  deposit_usdc: number;
  predictions: number;
  eligible: boolean;
  locked_credit: number;
  withdrawal_enabled: false;
  offer: 15;
  asset: "USDC";
  launch_ready?: boolean;
  server_time?: string;
  qualified_at?: string | null;
};
const rewardSchema = z.object({
  ok: z.literal(true),
  account_created: z.boolean(),
  x_connected: z.boolean(),
  deposit_usdc: z.number().finite().nonnegative(),
  predictions: z.number().int().nonnegative(),
  eligible: z.boolean(),
  locked_credit: z.union([z.literal(0), z.literal(15)]),
  withdrawal_enabled: z.literal(false),
  offer: z.literal(15),
  asset: z.literal("USDC"),
  launch_ready: z.boolean(),
  server_time: z.string(),
  qualified_at: z.string().nullable(),
});
export function useRewardTasks() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const client = useQueryClient();
  useEffect(() => {
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setUser(data.session?.user ?? null);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setReady(true);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null);
        setReady(true);
        void client.invalidateQueries({ queryKey: ["reward-tasks"] });
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  const query = useQuery({
    queryKey: ["reward-tasks", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as SupabaseClient).rpc(
        "get_my_native_reward_tasks",
      );
      if (error) throw new Error("Task progress is temporarily unavailable.");
      const value = rewardSchema.parse(data);
      if (!value?.ok) throw new Error("Could not verify account tasks.");
      return value;
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["reward-tasks", user.id] });
    };
    const channel = supabase
      .channel(`reward-progress-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "protocol_reward_credits",
          filter: `user_id=eq.${user.id}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "protocol_wallets",
          filter: `user_id=eq.${user.id}`,
        },
        refresh,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, client]);
  return { user, ready, ...query, data: user ? query.data : undefined };
}
