import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function totpQrSrc(qrCode: string): string | null {
  const raw = qrCode.trim();
  if (!raw) return null;
  if (raw.startsWith("data:")) return raw;
  if (raw.startsWith("<svg") || raw.startsWith("<?xml"))
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(raw);
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return null;
}

export function AdminMfa({ onVerified }: { onVerified: () => void }) {
  const [factor, setFactor] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [message, setMessage] = useState("Loading authenticator status…");

  useEffect(() => {
    let live = true;
    void supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!live) return;
      const f = data?.totp.find((x) => x.status === "verified");
      if (error) {
        setMessage("Authenticator status unavailable. Try signing in again.");
        return;
      }
      if (f) {
        setFactor(f.id);
        setMessage("Enter the 6-digit code from your authenticator app.");
      } else {
        setMessage("Set up an authenticator to protect administrator access.");
      }
    });
    return () => {
      live = false;
    };
  }, []);

  async function enroll() {
    setBusy(true);
    setCopied(false);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "TacPredict admin " + Date.now(),
      });
      if (error || !data?.totp) throw Error(error?.message || "enroll failed");
      setFactor(data.id);
      setSecret(data.totp.secret || "");
      setUri(data.totp.uri || "");
      setQr(totpQrSrc(data.totp.qr_code || ""));
      setEnrolling(true);
      setMessage(
        "Copy the secret below into Google Authenticator / Authy (Add account → Enter a setup key), then type the 6-digit code the app shows.",
      );
    } catch {
      setMessage("Authenticator setup failed. No administrator permission was granted.");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Could not copy automatically — select the secret and copy manually.");
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
      setQr(null);
      setSecret("");
      setUri("");
      setEnrolling(false);
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

      {!factor && !enrolling ? (
        <button
          disabled={busy}
          onClick={() => void enroll()}
          className="finance-pill finance-pill-primary"
        >
          {busy ? "Preparing…" : "Set up authenticator"}
        </button>
      ) : null}

      {enrolling && secret ? (
        <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Setup key (copy into authenticator)
          </p>
          <p className="break-all font-mono text-sm tracking-wide text-foreground">{secret}</p>
          <button
            type="button"
            onClick={() => void copySecret()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy setup key"}
          </button>
          {uri ? (
            <p className="break-all text-[10px] text-muted-foreground">
              Account: TacPredict · type Time-based · paste the key above
            </p>
          ) : null}
        </div>
      ) : null}

      {enrolling && qr ? (
        <div className="space-y-2">
          <p className="text-center text-xs text-muted-foreground">Or scan QR (optional)</p>
          <img
            src={qr}
            alt="Authenticator enrollment QR"
            className="mx-auto size-48 rounded-xl bg-white p-3"
          />
        </div>
      ) : null}

      {factor ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <label className="block text-sm">
            6-digit code from authenticator
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
              placeholder="000000"
            />
          </label>
          <button
            disabled={busy || code.length !== 6}
            className="finance-pill finance-pill-primary"
          >
            {busy ? "Verifying…" : "Verify & continue"}
          </button>
        </form>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        Server checks assigned admin role + AAL2. This does not replace on-chain wallet authorization.
      </p>
    </section>
  );
}
