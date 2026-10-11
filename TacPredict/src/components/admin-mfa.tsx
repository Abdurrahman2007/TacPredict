import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
export function AdminMfa({ onVerified }: { onVerified: () => void }) {
  const [factor, setFactor] = useState(""),
    [qr, setQr] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("Loading authenticator status…");
  useEffect(() => {
    let live = true;
    void supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!live) return;
      const f = data?.totp.find((x) => x.status === "verified");
      if (error) {
        setMessage("Authenticator status unavailable. Try signing in again.");
        return;
      }
      if (f) setFactor(f.id);
      setMessage(
        f
          ? "Enter the code from your authenticator."
          : "Set up an authenticator to protect administrator access.",
      );
    });
    return () => {
      live = false;
    };
  }, []);
  async function enroll() {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "TacPredict admin " + Date.now(),
      });
      if (error || !data) throw Error();
      setFactor(data.id);
      setQr("data:image/svg+xml;charset=utf-8," + encodeURIComponent(data.totp.qr_code));
      setMessage(
        "Scan this QR in your authenticator, then enter its six-digit code. Keep it private.",
      );
    } catch {
      setMessage("Authenticator setup failed. No administrator permission was granted.");
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (!/^\d{6}$/.test(code)) {
      setMessage("Enter a six-digit authenticator code.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor, code });
      if (error) throw Error();
      setCode("");
      setQr("");
      onVerified();
    } catch {
      setCode("");
      setMessage("Verification failed. Check your authenticator code and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="finance-card mx-auto max-w-md space-y-5" aria-labelledby="admin-mfa-title">
      <p className="text-xs uppercase tracking-widest text-primary">Protected workspace</p>
      <h1 id="admin-mfa-title" className="text-2xl font-semibold">
        Administrator verification
      </h1>
      <p role="status" className="text-sm leading-6 text-muted-foreground">
        {message}
      </p>
      {qr && (
        <img
          src={qr}
          alt="Private authenticator enrollment QR"
          className="mx-auto size-48 rounded-xl bg-white p-3"
        />
      )}
      {!factor ? (
        <button
          disabled={busy}
          onClick={() => void enroll()}
          className="finance-pill finance-pill-primary"
        >
          Set up authenticator
        </button>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <label className="block text-sm">
            Authenticator code
            <input
              name="admin-totp"
              aria-label="Authenticator code"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-4 text-xl tracking-widest"
            />
          </label>
          <button
            disabled={busy || code.length !== 6}
            className="finance-pill finance-pill-primary"
          >
            {busy ? "Verifying…" : "Verify & continue"}
          </button>
        </form>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        A real assigned role and AAL2 session are checked by the server and database. This does not
        replace on-chain wallet authorization.
      </p>
    </section>
  );
}
