import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Gift, LockKeyhole, Check, RefreshCw, ArrowRight } from "lucide-react";
import { useLoginDialog } from "@/components/login-dialog";
import { useRewardTasks } from "@/lib/use-reward-tasks";
import { rewardView } from "@/lib/reward-view";
import { supabase } from "@/integrations/supabase/client";
import { useAuthFeatures } from "@/lib/use-auth-features";
export const Route = createFileRoute("/rewards")({
  head: () => ({ meta: [{ title: "Rewards — TacPredict" }] }),
  component: RewardsPage,
});
function RewardsPage() {
  const auth = useAuthFeatures(),
    login = useLoginDialog(),
    q = useRewardTasks();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const view = rewardView(q.data, Boolean(q.user), q.isError),
    launch = view.verified && q.data?.launch_ready === true;
  async function connectX() {
    if (!q.user) {
      login("/rewards");
      return;
    }
    if (busy || !auth.x) return;
    setBusy(true);
    setMessage("");
    try {
      sessionStorage.setItem("tac-auth-next", "/rewards");
      const { error } = await supabase.auth.linkIdentity({
        provider: auth.xProvider,
        options: { redirectTo: `${location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch {
      setMessage("X could not be linked. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const rows = [
    {
      title: "Create an account",
      detail: view.done[0] ? "Verified" : "Sign in to begin",
      action: "account",
    },
    {
      title: "Deposit 5 USDC",
      detail: view.verified
        ? `${Math.min(q.data!.deposit_usdc, 5).toFixed(2)} / 5 USDC`
        : "Opens at launch",
      action: "deposit",
    },
    {
      title: "Make 4 predictions",
      detail: view.verified
        ? `${Math.min(q.data!.predictions, 4)} / 4 completed`
        : "Opens at launch",
      action: "prediction",
    },
    { title: "Connect X", detail: view.done[3] ? "Connected" : "Link your account", action: "x" },
  ];
  return (
    <div className="mx-auto max-w-3xl animate-enter" data-testid="rewards-page">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Rewards</h1>
        <span className="finance-badge">USDC</span>
      </div>
      <section className="mt-6 finance-card finance-reward-hero">
        <div className="flex items-center justify-between">
          <span className="finance-icon">
            <Gift size={23} />
          </span>
          <span className="finance-badge">
            <LockKeyhole size={12} />
            {view.earned ? "Earned · locked" : "Welcome offer"}
          </span>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">Complete your welcome journey</p>
        <p className="mt-2 text-5xl font-semibold tracking-tight">
          15 <span className="text-base font-medium text-muted-foreground">USDC</span>
        </p>
        <div className="mt-6 flex justify-between text-xs">
          <span>{view.verified ? `${view.complete}/4 completed` : "4 steps"}</span>
          <span className="text-muted-foreground">Withdrawal locked</span>
        </div>
        <div
          className="mt-3 grid grid-cols-4 gap-2"
          role="progressbar"
          aria-label="Verified reward progress"
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={view.verified ? view.complete : undefined}
        >
          {rows.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full ${view.verified && view.done[i] ? "bg-primary" : "bg-secondary"}`}
            />
          ))}
        </div>
      </section>
      <section
        className="mt-5 overflow-hidden rounded-3xl border border-border bg-card"
        aria-label="Welcome tasks"
      >
        {rows.map((row, i) => (
          <div
            key={row.action}
            className="flex items-center gap-3 border-b border-border p-5 last:border-b-0"
          >
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${view.verified && view.done[i] ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}
            >
              {view.verified && view.done[i] ? <Check size={16} /> : String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">{row.title}</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">{row.detail}</p>
            </div>
            {!(view.verified && view.done[i]) &&
              (row.action === "account" ? (
                <button
                  aria-label="Sign in to complete account task"
                  onClick={() => login("/rewards")}
                  className="grid size-10 place-items-center rounded-full bg-primary/15 text-primary"
                >
                  <ArrowRight size={17} />
                </button>
              ) : row.action === "x" ? (
                <button
                  aria-label="Connect X"
                  disabled={busy || (Boolean(q.user) && !auth.x)}
                  onClick={() => void connectX()}
                  className="grid size-10 place-items-center rounded-full bg-primary/15 text-primary"
                >
                  <ArrowRight size={17} />
                </button>
              ) : launch ? (
                <Link to="/markets" className="text-primary">
                  <ArrowRight size={17} />
                </Link>
              ) : (
                <LockKeyhole size={15} className="text-muted-foreground" />
              ))}
          </div>
        ))}
      </section>
      <div className="mt-5 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Promotional credit · not wallet funds</p>
        <button
          aria-label="Refresh reward progress"
          disabled={q.isFetching || !q.user}
          onClick={() => void q.refetch()}
          className="grid size-10 place-items-center text-muted-foreground"
        >
          <RefreshCw size={15} />
        </button>
      </div>
      <details className="mt-4 rounded-2xl border border-border p-4 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Reward details</summary>
        <p className="mt-3 leading-6 text-muted-foreground">
          All four requirements must be verified in your account. Funding and predictions count only
          after finalized Base protocol activity. The 15 USDC reward is a separate locked
          promotional credit, not spendable collateral or withdrawable wallet USDC. Future
          withdrawals require published terms and separate funding.
        </p>
      </details>
      {q.isError && (
        <p role="alert" className="mt-4 text-xs text-muted-foreground">
          Progress unavailable. Please refresh.
        </p>
      )}
      <p role="status" className="mt-4 text-xs text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
