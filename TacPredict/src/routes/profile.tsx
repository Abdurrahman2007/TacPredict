import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Gift,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Target,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePredictionWallet } from "@/lib/prediction-wallet";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — TacPredict" },
      {
        name: "description",
        content: "Your prediction portfolio, TAC Points and account activity.",
      },
    ],
  }),
  component: ProfilePage,
});

type ActivityFilter = "Active" | "Settled" | "All";
const number = new Intl.NumberFormat("en-US");

function ProfilePage() {
  const { user, ready, displayName, balance, positions, streak, refresh, signOut } =
    usePredictionWallet();
  const [filter, setFilter] = useState<ActivityFilter>("Active");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [securityOpen, setSecurityOpen] = useState(false);
  const stats = useMemo(() => {
    const active = positions.filter((position) => position.status === "active");
    const settled = positions.filter((position) => position.status !== "active");
    return {
      active,
      settled,
      committed: active.reduce((total, position) => total + position.amount, 0),
      potential: active.reduce((total, position) => total + position.potentialReturn, 0),
      wins: settled.filter(
        (position) => position.payout !== null && position.payout > position.amount,
      ).length,
    };
  }, [positions]);
  const visible =
    filter === "Active" ? stats.active : filter === "Settled" ? stats.settled : positions;
  const name = user ? displayName.trim() || "Predictor" : "Your next great call";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  async function accountAction(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-page animate-enter mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="section-kicker">YOUR CORNER OF THE MARKET</p>
          <h1 className="page-title">Profile</h1>
        </div>
        <Button
          variant="outline"
          size="icon"
          disabled={busy || !user}
          aria-label="Refresh account"
          onClick={() => void accountAction(refresh, "Account refreshed.")}
        >
          <RefreshCw className={busy ? "motion-safe:animate-spin" : ""} />
        </Button>
      </div>

      <section
        className="profile-hero mt-6 overflow-hidden rounded-3xl border border-border"
        aria-label="Account overview"
      >
        <div className="relative p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <div
              className="profile-avatar grid size-16 shrink-0 place-items-center rounded-2xl text-xl font-bold"
              aria-hidden="true"
            >
              {user ? initials : <Target className="size-7" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">
                {user ? "Good to have you here" : "A little insight. A better prediction."}
              </p>
              <h2 className="mt-1 break-words text-2xl font-bold tracking-tight">{name}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-primary">
                <ShieldCheck className="size-3.5" />
                {user ? "Signed-in account" : "Predict with TAC Points"}
              </p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-sm text-muted-foreground">Available balance</p>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="text-[2.75rem] font-bold leading-none tracking-tight tabular-nums sm:text-6xl">
                  {ready ? number.format(balance) : "—"}
                </span>
                <span className="text-sm font-semibold text-primary">TAC</span>
              </p>
              <p className="mt-3 text-sm text-muted-foreground">Virtual points. Real conviction.</p>
            </div>
            <Button asChild className="ios-press h-12 rounded-xl px-5">
              <Link to={user ? "/markets" : "/auth"}>
                {user ? "Make a prediction" : "Sign in to start"}
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border border-t border-border bg-background/25 py-5">
          {[
            { label: "Active", value: stats.active.length },
            { label: "Won", value: stats.wins },
            { label: "Day streak", value: streak },
          ].map((stat) => (
            <div key={stat.label} className="px-3 text-center">
              <p className="text-xl font-bold tabular-nums">
                {ready ? number.format(stat.value) : "—"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
        <section className="profile-metric rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="size-4" />
            In play
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums">
            {number.format(stats.committed)}{" "}
            <span className="text-sm font-medium text-muted-foreground">TAC</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Across active entries</p>
        </section>
        <section className="profile-metric rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowDownLeft className="size-4 text-primary" />
            Potential return
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums">
            {number.format(stats.potential)}{" "}
            <span className="text-sm font-medium text-muted-foreground">TAC</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">If all active calls win</p>
        </section>
      </div>

      <section className="mt-8" aria-labelledby="activity-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="activity-title" className="section-title">
            Your predictions
          </h2>
          <span className="text-sm text-muted-foreground">{positions.length} entries loaded</span>
        </div>
        <div
          className="profile-segments mt-4 grid grid-cols-3 rounded-xl border border-border bg-secondary/50 p-1"
          aria-label="Filter predictions"
        >
          {(["Active", "Settled", "All"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
              className={`ios-press min-h-11 rounded-lg text-sm font-semibold transition-colors ${filter === item ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {item}
              <span className="ml-1.5 opacity-60">
                {item === "Active"
                  ? stats.active.length
                  : item === "Settled"
                    ? stats.settled.length
                    : positions.length}
              </span>
            </button>
          ))}
        </div>
        {!ready ? (
          <div
            role="status"
            className="mt-4 rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground"
          >
            Loading your account…
          </div>
        ) : visible.length === 0 ? (
          <div className="profile-empty mt-4 rounded-2xl border border-dashed border-border p-8 text-center sm:p-12">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary">
              <Target className="size-6 text-primary" />
            </div>
            <h3 className="mt-4 text-lg font-bold">
              {filter === "Settled" ? "The results will land here" : "Your next call starts here"}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {filter === "Settled"
                ? "Resolved entries appear in your account history. No results to show yet."
                : "Explore a market, back your outcome and track your prediction here."}
            </p>
            <Button variant="outline" asChild className="mt-5 h-11 rounded-xl">
              <Link to="/markets">
                Explore markets
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {visible.map((position) => {
              const active = position.status === "active";
              const won = !active && position.payout !== null && position.payout > position.amount;
              return (
                <Link
                  key={position.id}
                  to="/markets/$marketId"
                  params={{ marketId: position.marketId }}
                  className="profile-position ios-press block rounded-2xl border border-border bg-card p-4 sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`grid size-10 shrink-0 place-items-center rounded-xl ${active ? "bg-secondary text-muted-foreground" : won ? "bg-positive-soft text-positive" : "bg-secondary text-muted-foreground"}`}
                    >
                      {active ? (
                        <Clock3 className="size-4" />
                      ) : won ? (
                        <Check className="size-4" />
                      ) : (
                        <Target className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-relaxed sm:text-base">
                        {position.marketTitle}
                      </h3>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {position.outcomeLabel}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                    <span className="font-semibold tabular-nums">
                      {number.format(position.amount)} TAC{" "}
                      <span className="font-normal text-muted-foreground">entered</span>
                    </span>
                    <span className={won ? "text-positive" : "text-muted-foreground"}>
                      {active ? "Active" : position.status} · {active ? "potential " : "payout "}
                      {number.format(
                        active ? position.potentialReturn : (position.payout ?? 0),
                      )}{" "}
                      TAC
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {positions.length >= 100 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Showing your latest 100 entries. Totals reflect this loaded history.
          </p>
        )}
      </section>

      <section
        className="mt-8 overflow-hidden rounded-2xl border border-border bg-card"
        aria-label="Account actions"
      >
        <Link to="/rewards" className="ios-press flex min-h-16 items-center gap-3 px-5">
          <span className="grid size-9 place-items-center rounded-xl bg-positive-soft text-primary">
            <Gift className="size-4" />
          </span>
          <span className="flex-1 text-sm font-semibold">Rewards & daily check-in</span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
        <div className="border-t border-border">
          <button
            type="button"
            aria-expanded={securityOpen}
            className="ios-press flex min-h-16 w-full items-center gap-3 px-5 text-left"
            onClick={() => setSecurityOpen(!securityOpen)}
          >
            <span className="grid size-9 place-items-center rounded-xl bg-secondary">
              <ShieldCheck className="size-4" />
            </span>
            <span className="flex-1 text-sm font-semibold">Account & privacy</span>
            <ChevronRight
              className={`size-4 text-muted-foreground transition-transform ${securityOpen ? "rotate-90" : ""}`}
            />
          </button>
          {securityOpen && (
            <div className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
              {user
                ? "Your account and entries are stored in the configured Supabase backend. This app uses virtual TAC Points, not cash deposits."
                : "Sign in to save predictions to your account. TAC Points are virtual and have no cash value."}
            </div>
          )}
        </div>
        {user && (
          <div className="border-t border-border">
            <button
              type="button"
              disabled={busy}
              onClick={() => void accountAction(signOut, "Signed out.")}
              className="ios-press flex min-h-16 w-full items-center gap-3 px-5 text-left text-muted-foreground"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-secondary">
                <LogOut className="size-4" />
              </span>
              <span className="text-sm font-semibold">Sign out</span>
            </button>
          </div>
        )}
      </section>
      <p
        role="status"
        aria-live="polite"
        className="mt-4 min-h-5 text-center text-sm text-muted-foreground"
      >
        {message}
      </p>
      <p className="mt-5 text-center text-sm text-muted-foreground">TACPREDICT · MAKE YOUR CALL</p>
    </div>
  );
}
