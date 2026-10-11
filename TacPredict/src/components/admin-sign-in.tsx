import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Admin-only sign-in: email + password. No public OTP/social/wallet chrome. */
export function AdminSignIn({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const signInPassword = async () => {
    setBusy(true);
    setMessage("");
    try {
      const target = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) throw new Error("Enter a valid email.");
      if (password.length < 8) throw new Error("Enter your account password.");
      const { error } = await supabase.auth.signInWithPassword({ email: target, password });
      if (error) throw error;
      setPassword("");
      onSuccess();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message.slice(0, 240)
          : "Sign-in failed. Use the administrator email and password from Supabase Auth.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-md space-y-6 py-6">
      <div className="text-center sm:text-left">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Restricted access
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Admin login</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Email and password for the assigned Supabase <code className="text-foreground">admin</code>{" "}
          account only. After login you must complete TOTP (AAL2). Public Google / X / wallet sign-in
          is not used here.
        </p>
      </div>

      <form
        className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void signInPassword();
        }}
      >
        <label className="block text-sm font-medium">
          Email
          <input
            type="email"
            autoComplete="username"
            required
            disabled={busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"
            placeholder="admin@…"
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"
            placeholder="••••••••"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Signing in…" : "Continue to admin"}
        </button>
        {message && (
          <p role="alert" className="text-xs text-destructive">
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
