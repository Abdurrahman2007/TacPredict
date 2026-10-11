import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthPanel } from "@/components/auth-panel";

/** Admin-only sign-in: email+password (Supabase Auth) plus existing OTP/social panel. */
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
          : "Sign-in failed. Check email/password or use another method below.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-md space-y-6 py-10">
      <div>
        <h1 className="page-title">Admin sign-in</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sign in with the Supabase administrator account that has the{" "}
          <code className="text-foreground">admin</code> role, then complete TOTP (AAL2). A shared
          password from chat is never hardcoded into the app — use the password set on that account
          in Supabase Auth.
        </p>
      </div>

      <form
        className="space-y-3 rounded-[26px] border border-border bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void signInPassword();
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Email + password
        </p>
        <label className="block text-sm">
          Email
          <input
            type="email"
            autoComplete="username"
            required
            disabled={busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Signing in…" : "Sign in to admin"}
        </button>
        {message && (
          <p role="alert" className="text-xs text-destructive">
            {message}
          </p>
        )}
      </form>

      <div className="relative text-center text-xs text-muted-foreground">
        <span className="bg-background px-2">or other methods</span>
      </div>

      <AuthPanel onSuccess={onSuccess} />
    </section>
  );
}
