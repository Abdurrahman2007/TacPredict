import { useEffect, useState } from "react";
import { authenticatorQrSource } from "@/lib/auth/mfa-qr.mjs";
import { supabase } from "@/integrations/supabase/client";
export function AdminMfa({ onVerified }: { onVerified: () => void }) {
  const [factor, setFactor] = useState(""),
    [qr, setQr] = useState(""),
    [code, setCode] = useState(""),
    [setupKey, setSetupKey] = useState(""),
    [showKey, setShowKey] = useState(false),
    [qrFailed, setQrFailed] = useState(false),
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
      setSetupKey(data.totp.secret);
      setShowKey(false);
      setQrFailed(false);
      try { setQr(authenticatorQrSource(data.totp.qr_code)); }
      catch { setQr(""); setQrFailed(true); }
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
      setSetupKey("");
      setShowKey(false);
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
      {qr && !qrFailed && (
        <img
          src={qr}
          onError={() => setQrFailed(true)}
          alt="Private authenticator enrollment QR"
          className="mx-auto size-48 rounded-xl bg-white p-3"
        />
      )}
      {setupKey && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          {qrFailed && <p role="alert" className="text-sm">QR unavailable. Add the setup key manually in your authenticator.</p>}
          <button type="button" className="text-sm text-primary underline" onClick={() => setShowKey(!showKey)}>
            {showKey ? "Hide setup key" : "Can't scan? Show private setup key"}
          </button>
          {showKey && <div>
            <p className="mb-2 text-xs text-muted-foreground">Add a time-based (TOTP) account named TacPredict. Keep this key private.</p>
            <code className="block select-all break-all rounded-lg bg-background p-3 text-sm">{setupKey}</code>
          </div>}
        </div>
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
        Use Google Authenticator, Microsoft Authenticator or another TOTP app. Administrator permissions and wallet authorization remain separate.
      </p>
    </section>
  );
}
