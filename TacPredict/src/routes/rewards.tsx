import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock3, Flame, Gift, Sparkles, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PredictionWalletProvider, usePredictionWallet } from "@/lib/prediction-wallet";
import { RewardExtras } from "@/components/reward-extras";
import { cooldownLabel } from "@/lib/reward-clock";

export const Route = createFileRoute("/rewards")({
  head: () => ({
    meta: [
      { title: "Rewards — TacPredict" },
      { name: "description", content: "TAC Points rewards, separate from your Base USDC wallet." },
    ],
  }),
  component: RewardsRoute,
});
function RewardsRoute() {
  return (
    <PredictionWalletProvider>
      <RewardsPage />
    </PredictionWalletProvider>
  );
}
function RewardsPage() {
  const {
    user,
    ready,
    balance,
    streak,
    rewardBackendReady,
    rewardSecondsRemaining,
    rewardAmount,
    claimDailyReward,
  } = usePredictionWallet();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const waiting = rewardSecondsRemaining > 0;
  async function claim() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await claimDailyReward();
      setStatus(result.message ?? "Claim complete.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="animate-enter mx-auto max-w-4xl">
      <h1 className="page-title">Rewards</h1>
      <section className="onchain-balance-card mt-6 rounded-[24px] border border-border p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">TAC Points</p>
          <Gift className="size-5 text-primary" />
        </div>
        <p className="mt-3 text-4xl font-semibold tabular-nums">
          {!user ? "0" : ready ? balance.toLocaleString() : "Loading…"}
          <span className="ml-2 text-base text-muted-foreground">TAC</span>
        </p>
        <p className="mt-3 text-xs text-muted-foreground">Virtual points · no cash value</p>
      </section>
      <section
        className="mt-4 rounded-[24px] border border-border bg-card p-6"
        aria-label="Daily check-in and streak"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Daily check-in</h2>
          <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-2 text-sm text-primary">
            <Flame className="size-4" />
            {user && ready ? streak : 0} day streak
          </span>
        </div>
        <div className="mb-5 grid grid-cols-7 gap-2" aria-label="Seven-day streak progress">
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className={`grid h-11 place-items-center rounded-xl text-xs font-semibold ${user && ready && streak > i ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="mt-2 text-2xl font-semibold">
              {waiting ? "Next drop" : "Claim reward"}
            </h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
            <Sparkles className="size-4" />
            {user && rewardBackendReady ? `+${rewardAmount}` : "100–160"} TAC
          </span>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="size-4" />
            {waiting ? cooldownLabel(rewardSecondsRemaining) : "Every 24 hours"}
          </p>
          {!user ? (
            <Button asChild className="h-12 rounded-xl">
              <Link to="/auth" search={{ next: "/rewards" }}>
                Sign in <ArrowUpRight />
              </Link>
            </Button>
          ) : (
            <Button
              className="h-12 rounded-xl"
              disabled={!ready || !rewardBackendReady || waiting || busy}
              onClick={() => void claim()}
            >
              {busy
                ? "Claiming…"
                : waiting
                  ? "Reward cooling down"
                  : !rewardBackendReady
                    ? "Backend setup pending"
                    : "Claim TAC Points"}
            </Button>
          )}
        </div>
        {user && !rewardBackendReady && (
          <p className="mt-4 text-sm text-muted-foreground">Rewards setup pending.</p>
        )}
        {status && (
          <p role="status" className="mt-4 text-sm">
            {status}
          </p>
        )}
      </section>
      <RewardExtras />
    </div>
  );
}
