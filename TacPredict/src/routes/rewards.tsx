import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock3, Flame, Gift, ShieldCheck, Sparkles, ArrowUpRight } from "lucide-react";
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
      <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <section className="onchain-balance-card rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground">
              TAC POINTS BALANCE
            </p>
            <Gift className="size-6 text-primary" />
          </div>
          <p className="mt-6 text-5xl font-semibold tracking-tight tabular-nums">
            {user && ready ? balance.toLocaleString() : "—"}
            <span className="ml-3 text-base text-muted-foreground">TAC</span>
          </p>
          <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0" />
            Virtual points · no cash value
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Flame className="size-5" />
            </span>
            <span className="text-sm text-muted-foreground">Claim streak</span>
          </div>
          <p className="mt-5 text-4xl font-semibold">
            {user ? streak : "—"}
            <span className="ml-2 text-base text-muted-foreground">days</span>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">48h streak window</p>
        </section>
      </div>
      <section className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="mt-2 text-2xl font-semibold">{waiting ? "Next drop" : "Daily claim"}</h2>
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
