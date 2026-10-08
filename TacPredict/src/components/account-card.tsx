import { useLoginDialog } from "@/components/login-dialog";
import { useEffect, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
export function AccountCard() {
  const showLogin = useLoginDialog();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
        if (active) {
          setReady(true);
          setMessage("Account unavailable. Try again later.");
        }
      });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null);
        setReady(true);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <section
      className="mt-4 rounded-2xl border border-border bg-card p-5"
      aria-label="TacPredict account"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <UserRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{user ? "Signed in" : "TacPredict account"}</h2>
          <p className="mt-1 break-all text-xs leading-5 text-muted-foreground">
            {!ready
              ? "Checking session…"
              : user?.email ||
                (user
                  ? "Wallet account · separate from your USDC connection"
                  : "Sign in to track your rewards and predictions.")}
          </p>
        </div>
      </div>
      {ready &&
        (user ? (
          <Button
            variant="outline"
            disabled={busy}
            className="mt-4 rounded-xl"
            onClick={async () => {
              setBusy(true);
              const { error } = await supabase.auth.signOut();
              setMessage(error ? "Could not sign out. Please try again." : "");
              setBusy(false);
            }}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        ) : (
          <button
            onClick={() => showLogin("/profile")}
            className="mt-4 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Sign in
          </button>
        ))}
      {message && (
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </section>
  );
}
