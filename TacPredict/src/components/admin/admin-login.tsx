import { BRAND_LOGO_URL } from "@/lib/brand";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminCenter } from "./admin-shell";

/** Email + password sign-in for the assigned Supabase administrator. Authenticator code follows. */
export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const target = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) throw new Error("Enter a valid email.");
      if (password.length < 8) throw new Error("Enter your account password.");
      const { error } = await supabase.auth.signInWithPassword({ email: target, password });
      if (error) throw error;
      setPassword("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message.slice(0, 200) : "Sign-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCenter>
      <div className="adm-login-card">
        <div className="adm-brand" style={{ padding: 0 }}>
          <img
            src={BRAND_LOGO_URL}
            className="adm-brand-mark"
            width={34}
            height={34}
            alt=""
            style={{ background: "#000", objectFit: "contain" }}
          />
          <div>
            <b>TacPredict</b>
            <small>Admin</small>
          </div>
        </div>
        <div>
          <h1>Admin sign in</h1>
          <p className="adm-sub">
            Enter your email and password. Next, confirm your authenticator code.
          </p>
        </div>
        <form
          style={{ display: "grid", gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="adm-field">
            Email
            <input
              className="adm-input"
              type="email"
              autoComplete="username"
              required
              disabled={busy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </label>
          <label className="adm-field">
            Password
            <input
              className="adm-input"
              type="password"
              autoComplete="current-password"
              required
              disabled={busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
          <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {message ? (
            <div className="adm-notice" data-tone="bad" role="alert">
              {message}
            </div>
          ) : null}
        </form>
      </div>
    </AdminCenter>
  );
}

/** Shown when a signed-in account does not have the administrator role. */
export function AdminNoRole({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <AdminCenter>
      <div className="adm-login-card">
        <h1>No administrator access</h1>
        <p className="adm-sub">
          <b style={{ overflowWrap: "anywhere" }}>{email}</b> is not an admin account. Ask an
          existing admin to give you access, then sign in again.
        </p>
        <button type="button" className="adm-btn" onClick={onSignOut}>
          Sign out and use another account
        </button>
      </div>
    </AdminCenter>
  );
}

export function AdminSplash({ text }: { text: string }) {
  return (
    <AdminCenter>
      <div className="adm-notice" role="status">
        {text}
      </div>
    </AdminCenter>
  );
}
