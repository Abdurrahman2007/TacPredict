import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUpRight, Check, Gift, LockKeyhole, UserRound, Wallet, LineChart } from "lucide-react";
import { useLoginDialog } from "@/components/login-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useRewardTasks } from "@/lib/use-reward-tasks";
import { supabase } from "@/integrations/supabase/client";
import { authFeatures } from "@/lib/auth-config";
export const Route = createFileRoute("/rewards")({
  head: () => ({
    meta: [
      { title: "Rewards — TacPredict" },
      {
        name: "description",
        content:
          "Complete verified account tasks to qualify for a locked 15 USDC promotional reward. Withdrawals are unavailable.",
      },
    ],
  }),
  component: RewardsPage,
});
function RewardsPage() {
  const showLogin = useLoginDialog();
  const { user, ready, data, isError, isFetching, refetch } = useRewardTasks();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const account = Boolean(data?.account_created),
    x = Boolean(data?.x_connected),
    deposit = Math.max(0, Number(data?.deposit_usdc ?? 0)),
    predictions = Math.max(0, Number(data?.predictions ?? 0));
  const complete = [account, deposit >= 5, predictions >= 4, x].filter(Boolean).length;
  const tasks = [
    {
      title: "Create your account",
      description: "Sign in and verify your TacPredict account.",
      icon: UserRound,
      done: account,
      value: account ? "Verified" : "Not completed",
      kind: "account",
    },
    {
      title: "Deposit 5 USDC",
      description: "Requires a verified deposit into the prediction contract.",
      icon: Wallet,
      done: deposit >= 5,
      value: `${Math.min(deposit, 5).toFixed(2)} / 5 USDC`,
      kind: "deposit",
    },
    {
      title: "Make 4 predictions",
      description: "Four verified, USDC-funded prediction entries.",
      icon: LineChart,
      done: predictions >= 4,
      value: `${Math.min(predictions, 4)} / 4 predictions`,
      kind: "prediction",
    },
    {
      title: "Connect your X account",
      description: "Link X securely to this same TacPredict account.",
      icon: UserRound,
      done: x,
      value: x ? "Connected" : "Not connected",
      kind: "x",
    },
  ];
  async function connectX() {
    if (!user || busy || !authFeatures.x) return;
    setBusy(true);
    setMessage("");
    try {
      sessionStorage.setItem("tac-auth-next", "/rewards");
      const { error } = await supabase.auth.linkIdentity({
        provider: "twitter",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch {
      setMessage("Could not connect X. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="animate-enter mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">Rewards</h1>
        <span className="rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Welcome tasks
        </span>
      </div>
      <section className="mt-5 overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#222c37] via-card to-[#222332] p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Gift className="size-6" />
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <LockKeyhole className="size-3.5" />
            Locked
          </span>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          {data?.eligible ? "Your locked promotional credit" : "Locked reward offer"}
        </p>
        <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">
          15<span className="ml-2 text-lg text-muted-foreground">USDC</span>
        </p>
        <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
          Complete all four tasks to qualify. This is a locked promotional reward, not available
          wallet funds. Withdrawals are not enabled.
        </p>
        <div className="mt-5 flex items-center justify-between text-xs">
          <span>{complete} of 4 tasks completed</span>
          <span className="text-muted-foreground">{Math.round((complete / 4) * 100)}%</span>
        </div>
        <Progress
          className="mt-3 h-1.5 bg-secondary"
          value={(complete / 4) * 100}
          aria-label="Reward task completion"
        />
        <p className="mt-4 text-xs text-muted-foreground">
          {data?.eligible
            ? "Qualified · 15 USDC credit recorded and locked. Not withdrawable or spendable."
            : "15 USDC is a reward offer; it is not credited to your available balance."}
        </p>
      </section>
      <div className="mb-3 mt-7 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your reward journey</h2>
        <button
          className="min-h-10 text-xs text-primary disabled:text-muted-foreground"
          disabled={!user || isFetching}
          onClick={() => void refetch()}
        >
          {isFetching ? "Checking…" : "Refresh progress"}
        </button>
      </div>
      {!ready && <p className="mb-3 text-sm text-muted-foreground">Checking your account…</p>}
      {isError && (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          Task progress is temporarily unavailable. No completion has been assumed.
        </p>
      )}
      <div className="overflow-hidden rounded-[26px] border border-border bg-card px-5 sm:px-7">
        {tasks.map((task, index) => (
          <section
            key={task.kind}
            className="relative border-b border-border/60 py-6 last:border-b-0"
          >
            <div className="flex items-start gap-3">
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-full ${task.done ? "bg-emerald-400/10 text-emerald-400" : "bg-secondary text-muted-foreground"}`}
              >
                {task.done ? (
                  <Check className="size-5" />
                ) : (
                  <span className="text-base font-semibold">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                )}
              </span>
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.15em] text-primary">
                  Step {index + 1}
                </p>
                <h3 className="text-base font-semibold">{task.title}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{task.description}</p>
              </div>
            </div>
            <div className="ml-[52px] mt-3 flex min-h-10 flex-wrap items-center justify-between gap-2">
              <span
                className={`text-xs font-medium ${task.done ? "text-emerald-400" : "text-muted-foreground"}`}
              >
                {task.value}
              </span>
              {task.done ? (
                <span className="text-xs text-emerald-400">Complete</span>
              ) : task.kind === "account" || !user ? (
                <button
                  onClick={() => showLogin("/rewards")}
                  className="text-xs font-semibold text-primary"
                >
                  Sign in <ArrowUpRight className="inline size-3.5" />
                </button>
              ) : task.kind === "x" ? (
                <Button
                  variant="outline"
                  className="h-9 rounded-full text-xs"
                  disabled={busy || !authFeatures.x}
                  onClick={() => void connectX()}
                >
                  {busy ? "Connecting…" : authFeatures.x ? "Connect X" : "X setup pending"}
                </Button>
              ) : (
                <span className="rounded-full bg-secondary px-2.5 py-1.5 text-[10px] text-muted-foreground">
                  Onchain setup pending
                </span>
              )}
            </div>
          </section>
        ))}
      </div>
      {message && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {message}
        </p>
      )}
      <details className="mt-5 rounded-2xl border border-border px-5 py-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">Reward details</summary>
        <p className="mt-3 leading-6">
          Complete all four verified steps to qualify for 15 USDC in locked promotional credit. This
          credit is separate from your available balance and cannot currently be spent, transferred
          or withdrawn. Deposits and predictions require the contract/indexer integration; clicks
          alone never complete tasks. Any future withdrawals require a separately funded release.
        </p>
      </details>
    </div>
  );
}
