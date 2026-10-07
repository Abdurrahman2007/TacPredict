import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ticket, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePredictionWallet } from "@/lib/prediction-wallet";
export function RewardExtras() {
  const { user, refresh } = usePredictionWallet();
  const [asset, setAsset] = useState<"TAC" | "USDC">("TAC");
  const [period, setPeriod] = useState("Weekly");
  const [code, setCode] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let current = true;
    setReady(false);
    if (user)
      void supabase.rpc("get_tac_promo_status").then(({ data, error }) => {
        if (current)
          setReady(!error && (data as { version?: string } | null)?.version === "tac-promo-v1");
      });
    return () => {
      current = false;
    };
  }, [user]);
  async function redeem(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !ready || busy || asset !== "TAC") return;
    setBusy(true);
    setNotice("");
    try {
      const { data, error } = await supabase.rpc("redeem_tac_promo", { _code: code.trim() });
      const result = data as { ok?: boolean; message?: string; amount?: number } | null;
      setNotice(
        error
          ? "Could not redeem. Try again."
          : (result?.message ?? "Invalid or unavailable code."),
      );
      if (result?.ok) {
        setCode("");
        await refresh();
      }
    } catch {
      setNotice("Could not redeem. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Ticket className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Promo code</h2>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2" aria-label="Redeem asset">
          {(["TAC", "USDC"] as const).map((a) => (
            <button
              type="button"
              key={a}
              aria-pressed={asset === a}
              onClick={() => {
                setAsset(a);
                setNotice("");
              }}
              className={`min-h-11 rounded-xl border text-sm font-semibold ${asset === a ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >
              {a === "TAC" ? "TAC Points" : "USDC"}
            </button>
          ))}
        </div>
        <form className="mt-4 space-y-3" onSubmit={(e) => void redeem(e)}>
          <label htmlFor="promo-code" className="sr-only">
            Promo code
          </label>
          <input
            id="promo-code"
            className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-primary"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={64}
            placeholder="Enter code"
            autoComplete="off"
            spellCheck={false}
          />
          {!user && asset === "TAC" ? (
            <Button asChild className="h-12 w-full rounded-xl">
              <Link to="/auth" search={{ next: "/rewards" }}>
                Sign in to redeem
              </Link>
            </Button>
          ) : (
            <Button
              className="h-12 w-full rounded-xl"
              disabled={asset === "USDC" || !ready || busy || code.trim().length < 6}
            >
              {busy
                ? "Redeeming…"
                : asset === "USDC"
                  ? "USDC unavailable"
                  : !ready
                    ? "Promo backend pending"
                    : "Redeem TAC"}
            </Button>
          )}
        </form>
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {notice}
        </p>
      </section>
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Activity drops</h2>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {["Weekly", "Monthly"].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={`min-h-11 rounded-xl border text-sm font-semibold ${period === value ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-border p-4">
          <p className="font-semibold">{period} TAC giveaway</p>
          <p className="mt-2 text-sm text-muted-foreground">Verified trades & activity</p>
          <span className="mt-4 inline-flex rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
            Coming soon
          </span>
        </div>
      </section>
    </div>
  );
}
