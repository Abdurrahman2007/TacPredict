import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { secondsUntil } from "@/lib/reward-clock";
import { sendCheckIn } from "@/lib/virtual-set/wallet-trade";
import { useOnchainCheckinStatus, useOptionalWallet, useRefreshOnchain } from "@/lib/virtual-set/use-onchain";

/** Day 1 = $20 … Day 7 = $80 (+$10/day). UI ladder; claim prefers RPC when available. */
export const CHECKIN_DAYS = [20, 30, 40, 50, 60, 70, 80] as const;

const LOCAL_KEY = "tac-daily-checkin-v2";

type LocalCheckin = {
  streak: number;
  lastClaimAt: string | null;
  balance: number;
};

type Status = {
  ok: boolean;
  availableAt: string | null;
  nextReward: number;
  serverOffset: number;
  streak: number;
  balance: number;
  local: boolean;
};

function readLocal(): LocalCheckin {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { streak: 0, lastClaimAt: null, balance: 0 };
    return JSON.parse(raw) as LocalCheckin;
  } catch {
    return { streak: 0, lastClaimAt: null, balance: 0 };
  }
}

function writeLocal(next: LocalCheckin) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
}

export function dayFromReward(amount: number) {
  const idx = CHECKIN_DAYS.indexOf(amount as (typeof CHECKIN_DAYS)[number]);
  return idx >= 0 ? idx + 1 : 1;
}

function nextFromStreak(streak: number) {
  return CHECKIN_DAYS[Math.min(streak, 6)] ?? 20;
}

export function useDailyCheckin() {
  const { user, ready } = useProtocolUser();
  const client = useQueryClient();
  const wallet = useOptionalWallet();
  const chain = useOnchainCheckinStatus();
  const refreshChain = useRefreshOnchain();
  const [clock, setClock] = useState(() => Date.now());

  const status = useQuery({
    queryKey: ["daily-checkin", user?.id ?? "signed-out"],
    enabled: ready,
    queryFn: async (): Promise<Status> => {
      if (!user?.id) {
        const local = readLocal();
        return {
          ok: true,
          availableAt: local.lastClaimAt
            ? new Date(Date.parse(local.lastClaimAt) + 86_400_000).toISOString()
            : null,
          nextReward: nextFromStreak(local.streak),
          serverOffset: 0,
          streak: local.streak,
          balance: local.balance,
          local: true,
        };
      }
      try {
        const [{ data: profile }, { data: raw, error }] = await Promise.all([
          supabase.from("profiles").select("balance, streak").eq("id", user.id).maybeSingle(),
          supabase.rpc("get_reward_status"),
        ]);
        if (error) throw error;
        const s = raw as {
          ok?: boolean;
          version?: string;
          available_at?: string | null;
          next_reward?: number;
          server_time?: string;
        } | null;
        if (!s?.ok || s.version !== "rolling24h-v1") throw Error("backend");
        const serverTime = Date.parse(s.server_time ?? "");
        const streak = typeof profile?.streak === "number" ? profile.streak : 0;
        return {
          ok: true,
          availableAt: s.available_at ?? null,
          nextReward: nextFromStreak(streak),
          serverOffset: Number.isFinite(serverTime) ? serverTime - Date.now() : 0,
          streak,
          balance: typeof profile?.balance === "number" ? profile.balance : 0,
          local: false,
        };
      } catch {
        const local = readLocal();
        return {
          ok: true,
          availableAt: local.lastClaimAt
            ? new Date(Date.parse(local.lastClaimAt) + 86_400_000).toISOString()
            : null,
          nextReward: nextFromStreak(local.streak),
          serverOffset: 0,
          streak: local.streak,
          balance: local.balance,
          local: true,
        };
      }
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // On-chain mode: the streak and the next reward come from the contract (one check-in per UTC day).
  const chainData: Status | undefined = chain.status
    ? {
        ok: true,
        availableAt: chain.status.availableAtMs ? new Date(chain.status.availableAtMs).toISOString() : null,
        nextReward: chain.status.nextReward,
        serverOffset: 0,
        streak: chain.status.streak,
        balance: 0,
        local: false,
      }
    : undefined;
  const onchain = chain.enabled && chain.address !== null;
  const view: Pick<typeof status, "data"> = onchain ? { data: chainData } : status;
  const remaining = view.data ? secondsUntil(view.data.availableAt, clock + view.data.serverOffset) : 0;
  const canClaim = onchain
    ? chain.status?.available === true
    : Boolean(view.data?.ok && remaining <= 0);
  const nextDay = view.data ? dayFromReward(view.data.nextReward) : 1;

  const claim = useMutation({
    mutationFn: async () => {
      if (onchain) {
        if (!wallet?.address || !wallet.provider) throw Error("Connect your wallet first");
        const sent = await sendCheckIn({
          provider: wallet.provider,
          address: wallet.address,
          chainId: wallet.chainId,
          switchToBase: wallet.switchToBase,
        });
        if (!sent.ok) throw Error(sent.message);
        return { ok: true, reward: chain.status?.nextReward ?? 20, balance: 0, streak: (chain.status?.streak ?? 0) + 1 };
      }
      // Prefer on-chain / RPC path when signed in.
      if (user?.id && !status.data?.local) {
        const { data, error } = await supabase.rpc("claim_daily_reward");
        const result = data as {
          ok?: boolean;
          message?: string;
          reward?: number;
          balance?: number;
          streak?: number;
        } | null;
        if (error || !result) throw Error("On-chain claim unavailable. Try again.");
        if (!result.ok) throw Error(result.message ?? "Reward not available yet.");
        return {
          ...result,
          reward: nextFromStreak(typeof result.streak === "number" ? result.streak - 1 : 0),
        };
      }
      const local = readLocal();
      if (local.lastClaimAt && Date.now() - Date.parse(local.lastClaimAt) < 86_400_000)
        throw Error("Come back after 24 hours.");
      const reward = nextFromStreak(local.streak);
      const next = {
        streak: Math.min(local.streak + 1, 7),
        lastClaimAt: new Date().toISOString(),
        balance: local.balance + reward,
      };
      writeLocal(next);
      try {
        const { creditPaperBalance } = await import("@/lib/paper/ledger");
        creditPaperBalance(reward);
      } catch {
        /* optional */
      }
      return { ok: true, reward, balance: next.balance, streak: next.streak };
    },
    onSuccess: async () => {
      await Promise.all([
        refreshChain(),
        client.invalidateQueries({ queryKey: ["daily-checkin"] }),
        client.invalidateQueries({ queryKey: ["tac-points-balance"] }),
      ]);
    },
  });

  return { ready, user, status: view, remaining, canClaim, claim, nextDay };
}

export function formatCountdown(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
