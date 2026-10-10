import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  Gift,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import { useLoginDialog } from "@/components/login-dialog";
import { useRewardTasks } from "@/lib/use-reward-tasks";
import { rewardView } from "@/lib/reward-view";
import { supabase } from "@/integrations/supabase/client";
import { useAuthFeatures } from "@/lib/use-auth-features";
export const Route = createFileRoute("/rewards")({
  head: () => ({
    meta: [
      { title: "Rewards — TacPredict" },
      {
        name: "description",
        content:
          "Your verified four-step welcome journey. 15 USDC promotional credit stays locked and separate from wallet funds.",
      },
    ],
  }),
  component: RewardsPage,
});
function RewardsPage() {
  const auth = useAuthFeatures(),
    login = useLoginDialog();
  const q = useRewardTasks();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const view = rewardView(q.data, Boolean(q.user), q.isError);
  const checking = !q.ready || (Boolean(q.user) && q.isPending);
  const live = view.verified && q.data?.launch_ready === true;
  const tasks = [
    {
      id: "account",
      title: "Create your account",
      description: "Sign in and verify your TacPredict account.",
      detail: view.verified
        ? view.done[0]
          ? "Account verified"
          : "Verification required"
        : "Sign in to see verified progress",
    },
    {
      id: "deposit",
      title: "Fund 5 USDC",
      description:
        "Make one contribution of at least 5 native USDC to real Base prediction collateral.",
      detail: view.verified
        ? `${Math.min(q.data!.deposit_usdc, 5).toFixed(2)} / 5 USDC verified`
        : "— / 5 USDC verified",
    },
    {
      id: "prediction",
      title: "Make 4 predictions",
      description: "Four distinct USDC-funded buy orders, verified after settlement.",
      detail: view.verified
        ? `${Math.min(q.data!.predictions, 4)} / 4 predictions verified`
        : "— / 4 predictions verified",
    },
    {
      id: "x",
      title: "Connect your X account",
      description: "Link X to this same account. You can do this before launch.",
      detail: view.verified
        ? view.done[3]
          ? "X identity verified"
          : "X not connected"
        : "Identity verification required",
    },
  ];
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
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch {
      setMessage("X could not be linked. Your progress has not changed. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const nextTitle =
    view.next === "account"
      ? "Start with your account"
      : view.next === "x"
        ? "Connect X while you wait"
        : view.next === "retry"
          ? "Check your verified progress"
          : view.next === "complete"
            ? view.earned
              ? "Your credit is recorded"
              : "Credit confirmation pending"
            : live
              ? "Continue your onchain journey"
              : "Your next step opens at launch";
  function action(id: string) {
    if (id === "account")
      return (
        <button className="finance-pill finance-pill-primary" onClick={() => login("/rewards")}>
          Sign in <ArrowRight size={16} />
        </button>
      );
    if (id === "retry")
      return (
        <button className="finance-pill" disabled={q.isFetching} onClick={() => void q.refetch()}>
          Retry verification <RefreshCw size={15} />
        </button>
      );
    if (id === "x")
      return (
        <button
          className="finance-pill finance-pill-primary"
          disabled={busy || (Boolean(q.user) && !auth.x)}
          onClick={() => void connectX()}
        >
          {busy ? "Connecting…" : auth.x ? "Connect X" : "X unavailable"} <ArrowRight size={16} />
        </button>
      );
    if ((id === "deposit" || id === "prediction") && live)
      return (
        <Link className="finance-pill finance-pill-primary" to="/markets">
          View markets <ArrowRight size={16} />
        </Link>
      );
    return (
      <span className="finance-badge">
        <LockKeyhole size={13} />
        {id === "complete" ? "Non-withdrawable" : "Launch pending"}
      </span>
    );
  }
  return (
    <div className="finance-page animate-enter" data-testid="rewards-page">
      <header className="finance-page-header">
        <div>
          <p className="finance-eyebrow">YOUR WELCOME JOURNEY</p>
          <h1 className="page-title">Rewards</h1>
        </div>
        <span className="finance-badge">
          <Gift size={14} />
          USDC only
        </span>
      </header>
      <div className="finance-columns">
        <div className="min-w-0 space-y-5">
          <section className="finance-card finance-reward-hero" aria-label="Welcome reward">
            <div className="flex items-start justify-between gap-3">
              <span className="finance-icon">
                <Gift size={23} />
              </span>
              <span className="finance-badge text-primary">
                <LockKeyhole size={13} />
                {view.earned ? "Earned · locked" : "Locked offer"}
              </span>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              {view.earned ? "Your promotional credit" : "Welcome reward"}
            </p>
            <p className="finance-balance mt-2">
              15 <span>USDC</span>
            </p>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              {view.earned
                ? "All four requirements are verified. Your credit is recorded."
                : "Four verified steps. One welcome reward."}{" "}
              <strong className="font-medium text-foreground">
                Not wallet funds. Not withdrawable.
              </strong>
            </p>
            <div className="mt-7 border-t border-white/10 pt-5">
              <div className="flex justify-between gap-3 text-xs">
                <span>
                  {checking
                    ? "Checking progress…"
                    : view.verified
                      ? `${view.complete} of 4 completed`
                      : "4 steps to qualify"}
                </span>
                <span className="text-muted-foreground">
                  {view.verified ? `${view.complete * 25}%` : "Verified progress"}
                </span>
              </div>
              <div
                className="mt-3 grid grid-cols-4 gap-2"
                role="progressbar"
                aria-label="Verified welcome tasks"
                aria-valuemin={0}
                aria-valuemax={4}
                aria-valuenow={view.verified ? view.complete : undefined}
                aria-valuetext={
                  view.verified ? `${view.complete} of 4 verified` : "Verification not available"
                }
              >
                {view.done.map((done, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-colors motion-reduce:transition-none ${done ? "bg-primary" : "bg-white/10"}`}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {view.earned
                  ? "15 USDC earned credit · spending, transfers and withdrawals remain locked."
                  : "The offer becomes account credit only after every requirement is verified."}
              </p>
            </div>
          </section>
          <section className="finance-card finance-next" aria-label="Next recommended step">
            <div>
              <p className="finance-eyebrow text-primary">NEXT FOR YOU</p>
              <h2 className="mt-2 text-base font-semibold">{nextTitle}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {view.next === "x"
                  ? "Account linking is available independently of funding tasks."
                  : view.next === "complete"
                    ? view.earned
                      ? "Credit stays separate from your real Base USDC."
                      : "Requirements verified. Waiting for the account credit record."
                    : !live
                      ? "Funding and predictions require a verified protocol launch."
                      : "Only finalized onchain activity counts."}
              </p>
            </div>
            <div className="mt-4">{action(view.next)}</div>
          </section>
          <section aria-labelledby="journey-title">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="journey-title" className="text-lg font-semibold">
                Step by step
              </h2>
              <button
                className="inline-flex min-h-11 items-center gap-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                disabled={!q.user || q.isFetching}
                onClick={() => void q.refetch()}
              >
                <RefreshCw size={13} className={q.isFetching ? "motion-safe:animate-spin" : ""} />
                {q.isFetching ? "Checking…" : "Refresh"}
              </button>
            </div>
            {q.isError && (
              <div role="alert" className="finance-inline-alert mb-3">
                Reward status unavailable. We could not refresh verified progress; no task has been
                marked complete locally.
              </div>
            )}
            <div className="finance-card !p-0 overflow-hidden">
              {tasks.map((task, i) => (
                <article
                  className="finance-task"
                  key={task.id}
                  data-testid={`reward-task-${task.id}`}
                >
                  <div className={`finance-step ${view.done[i] ? "finance-step-done" : ""}`}>
                    {view.done[i] ? <Check size={18} /> : String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{task.title}</h3>
                      <span
                        className={`text-[11px] ${view.done[i] ? "text-emerald-300" : "text-muted-foreground"}`}
                      >
                        {view.done[i]
                          ? "Verified"
                          : checking
                            ? "Checking…"
                            : q.isError
                              ? "Unavailable"
                              : (i === 1 || i === 2) && !live
                                ? "Launch pending"
                                : "To do"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {task.description}
                    </p>
                    <p className="mt-3 text-xs tabular-nums text-muted-foreground">{task.detail}</p>
                    {!view.done[i] && (i === 0 || i === 3 || live) && (
                      <div className="mt-3">{action(task.id)}</div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
          {message && (
            <p role="status" className="finance-inline-alert">
              {message}
            </p>
          )}
        </div>
        <aside className="min-w-0 space-y-4">
          <section className="finance-card">
            <ShieldCheck className="text-primary" size={23} />
            <h2 className="mt-4 text-base font-semibold">Clear by design</h2>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              Your wallet USDC is yours. This reward is a separate, locked promotional account
              credit—not collateral or cash you can withdraw.
            </p>
            <dl className="mt-5 space-y-3 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Reward asset</dt>
                <dd>USDC</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Earned credit</dt>
                <dd className="tabular-nums">
                  {view.earned ? "15 USDC" : view.verified ? "Not earned" : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Withdrawals</dt>
                <dd className="text-primary">Locked</dd>
              </div>
            </dl>
          </section>
          <section className="finance-card">
            <h2 className="text-sm font-semibold">How verification works</h2>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              Account and X identities come from Supabase. Funding and predictions count only
              finalized native Base protocol events linked to a proven wallet. Testnet activity
              never qualifies.
            </p>
            <p className="mt-4 border-t border-white/10 pt-4 text-[11px] leading-5 text-muted-foreground">
              {view.verified && q.data?.server_time
                ? `Last checked ${new Date(q.data.server_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Sign in to load your verified status."}{" "}
              · Auto-refreshes while this page is open.
            </p>
          </section>
          <section className="finance-card !py-1" aria-label="Reward questions">
            {[
              [
                "Can I withdraw the reward?",
                "No. Earned promotional credit is locked, non-transferable and not spendable. Any future release requires separate funding and published terms.",
              ],
              [
                "What counts as a prediction?",
                "A distinct USDC-funded buy order settled on the native Base protocol. Partial fills of the same order count once; submitting an unfilled order does not count.",
              ],
              [
                "Can I connect X first?",
                "Yes. X linking is independent of the onchain launch. Sign in to the same account before linking.",
              ],
            ].map(([title, body]) => (
              <details className="finance-disclosure" key={title}>
                <summary>
                  {title}
                  <ChevronDown size={14} />
                </summary>
                <p>{body}</p>
              </details>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
