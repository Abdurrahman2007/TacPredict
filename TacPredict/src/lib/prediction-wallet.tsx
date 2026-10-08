import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { secondsUntil } from "./reward-clock";
import { placePrediction } from "./predictions.functions";

export type PredictionPosition = {
  id: string;
  marketId: string;
  marketTitle: string;
  outcomeId: string;
  outcomeLabel: string;
  amount: number;
  potentialReturn: number;
  createdAt: string;
  status: string;
  payout: number | null;
};

type EntryInput = { marketId: string; outcomeId: string; amount: number };
type Result = { ok: true; message?: string } | { ok: false; message: string };

type WalletContextValue = {
  user: User | null;
  ready: boolean;
  displayName: string;
  balance: number;
  streak: number;
  claimedDailyReward: boolean;
  rewardBackendReady: boolean;
  rewardSecondsRemaining: number;
  nextRewardAt: string | null;
  rewardAmount: number;
  positions: PredictionPosition[];
  enterMarket: (input: EntryInput) => Promise<Result>;
  claimDailyReward: () => Promise<Result>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function PredictionWalletProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState({
    displayName: "",
    balance: 0,
    streak: 0,
    lastCheckIn: null as string | null,
  });
  const [positions, setPositions] = useState<PredictionPosition[]>([]);
  const lock = useRef(false);
  const rewardLock = useRef(false);
  const loadVersion = useRef(0);
  const [rewardState, setRewardState] = useState({
    backendReady: false,
    availableAt: null as string | null,
    amount: 100,
    serverOffset: 0,
  });
  const [clock, setClock] = useState(() => Date.now());

  const load = useCallback(async (uid: string | undefined) => {
    const version = ++loadVersion.current;
    if (!uid) {
      setProfile({ displayName: "", balance: 0, streak: 0, lastCheckIn: null });
      setPositions([]);
      setRewardState({ backendReady: false, availableAt: null, amount: 100, serverOffset: 0 });
      return;
    }
    const [{ data: p }, { data: preds }, { data: rewardStatus, error: rewardError }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, balance, streak, last_check_in")
          .eq("id", uid)
          .maybeSingle(),
        supabase
          .from("predictions")
          .select("*")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.rpc("get_reward_status"),
      ]);
    if (version !== loadVersion.current) return;
    const status = rewardStatus as {
      ok?: boolean;
      version?: string;
      available_at?: string | null;
      next_reward?: number;
      server_time?: string;
    } | null;
    const backendReady = !rewardError && status?.ok === true && status.version === "rolling24h-v1";
    const serverTime = Date.parse(status?.server_time ?? "");
    setRewardState({
      backendReady,
      availableAt: backendReady ? (status?.available_at ?? null) : null,
      amount: backendReady && typeof status?.next_reward === "number" ? status.next_reward : 100,
      serverOffset: Number.isFinite(serverTime) ? serverTime - Date.now() : 0,
    });
    if (p)
      setProfile({
        displayName: p.display_name ?? "",
        balance: p.balance,
        streak: p.streak,
        lastCheckIn: p.last_check_in,
      });
    setPositions(
      (preds ?? []).map((r) => ({
        id: r.id,
        marketId: r.market_id,
        marketTitle: r.market_title,
        outcomeId: r.outcome_id,
        outcomeLabel: r.outcome_label,
        amount: r.amount,
        potentialReturn: r.potential_return,
        createdAt: r.created_at,
        status: r.status,
        payout: r.payout,
      })),
    );
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "INITIAL_SESSION" ||
        event === "USER_UPDATED"
      ) {
        void load(session?.user.id).finally(() => setReady(true));
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const enterMarket = useCallback(
    async (input: EntryInput): Promise<Result> => {
      if (!user) return { ok: false, message: "Sign in to make a prediction." };
      if (lock.current) return { ok: false, message: "Your previous entry is still processing." };
      if (!Number.isInteger(input.amount) || input.amount < 10)
        return { ok: false, message: "Enter at least 10 TAC." };
      lock.current = true;
      try {
        const result = await placePrediction({
          data: { ...input, idempotencyKey: crypto.randomUUID() },
        });
        if (!result.ok) return { ok: false, message: result.message };
        setProfile((c) => ({ ...c, balance: result.balance }));
        await load(user.id);
        return { ok: true };
      } catch {
        return { ok: false, message: "Could not place prediction. Please try again." };
      } finally {
        lock.current = false;
      }
    },
    [user, load],
  );

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void load(user.id);
    };
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [user, load]);

  const claimDailyReward = useCallback(async (): Promise<Result> => {
    if (!user) return { ok: false, message: "Sign in to claim rewards." };
    if (!rewardState.backendReady)
      return { ok: false, message: "The 24-hour rewards backend has not been deployed yet." };
    if (rewardLock.current) return { ok: false, message: "Your claim is already processing." };
    rewardLock.current = true;
    try {
      const { data, error } = await supabase.rpc("claim_daily_reward");
      const result = data as { ok: boolean; message?: string; reward?: number } | null;
      if (error || !result)
        return { ok: false, message: "Could not claim right now. Please try again." };
      await load(user.id);
      setClock(Date.now());
      return result.ok
        ? { ok: true, message: `${result.reward} TAC added to your points balance.` }
        : { ok: false, message: result.message ?? "Reward not available yet." };
    } catch {
      return { ok: false, message: "Could not claim right now. Please try again." };
    } finally {
      rewardLock.current = false;
    }
  }, [user, load, rewardState.backendReady]);
  const rewardSecondsRemaining = secondsUntil(
    rewardState.availableAt,
    clock + rewardState.serverOffset,
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      user,
      ready,
      displayName: profile.displayName,
      balance: profile.balance,
      streak: profile.streak,
      claimedDailyReward: rewardSecondsRemaining > 0,
      rewardBackendReady: rewardState.backendReady,
      rewardSecondsRemaining,
      nextRewardAt: rewardState.availableAt,
      rewardAmount: rewardState.amount,
      positions,
      enterMarket,
      claimDailyReward,
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refresh: () => load(user?.id),
    }),
    [
      user,
      ready,
      profile,
      positions,
      enterMarket,
      claimDailyReward,
      load,
      rewardState,
      rewardSecondsRemaining,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function usePredictionWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("usePredictionWallet must be used inside PredictionWalletProvider");
  return context;
}
