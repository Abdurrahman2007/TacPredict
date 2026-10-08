import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LogOut, Mail, Wallet } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { FarcasterSignIn } from "@/components/farcaster-sign-in";
import { signInWithEthereumWallet } from "@/lib/onchain/wallet-auth";
import { useAuthFeatures } from "@/lib/use-auth-features";
import { safeAuthNext } from "@/lib/auth-config";

export function AuthPanel({
  next = "/",
  onSuccess,
}: {
  next?: "/" | "/rewards" | "/profile";
  onSuccess?: () => void;
}) {
  const authFeatures = useAuthFeatures();
  const navigate = useNavigate();
  const { wallets } = useBaseWallet();
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [chooseWallet, setChooseWallet] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [farcasterBusy, setFarcasterBusy] = useState(false);
  const locked = busy || farcasterBusy;
  const requestLock = useRef(false);
  const seconds = Math.max(0, Math.ceil((expiresAt - clock) / 1000));
  const resendSeconds = Math.max(0, Math.ceil((resendAt - clock) / 1000));

  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (live) setUser(data.session?.user ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (live) setUser(session?.user ?? null);
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!sentTo) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sentTo]);

  const finish = async () => {
    if (onSuccess) onSuccess();
    else await navigate({ to: safeAuthNext(next) });
  };
  const attempt = async (work: () => Promise<void>) => {
    if (requestLock.current) return;
    requestLock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      const raw =
        error instanceof Error ? error.message : "Sign-in could not complete. Please try again.";
      setMessage(
        /rate|too many|seconds/i.test(raw)
          ? "Too many requests. Please wait before trying again."
          : /email.*not.*authorized|smtp|sending.*email/i.test(raw)
            ? "Email delivery is not ready yet. Please use wallet sign-in or try later."
            : raw.slice(0, 240),
      );
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  };
  const sendCode = () =>
    attempt(async () => {
      if (!authFeatures.emailOtp)
        throw new Error("Email codes are being configured. Wallet sign-in is available now.");
      const target = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target))
        throw new Error("Enter a valid email address.");
      const { error } = await supabase.auth.signInWithOtp({
        email: target,
        options: { shouldCreateUser: mode === "signup" },
      });
      if (error) throw error;
      const now = Date.now();
      setSentTo(target);
      setCode("");
      setClock(now);
      setExpiresAt(now + 600_000);
      setResendAt(now + 60_000);
      setMessage("Check your inbox for your six-digit code.");
    });
  const verifyCode = () =>
    attempt(async () => {
      if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit code from your email.");
      const { error } = await supabase.auth.verifyOtp({
        email: sentTo,
        token: code,
        type: "email",
      });
      if (error)
        throw new Error("This code is invalid or expired. Check your email or request a new code.");
      setCode("");
      await finish();
    });

  const emailForm = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void (sentTo ? verifyCode() : sendCode());
      }}
      className="space-y-3"
    >
      {sentTo ? (
        <>
          <p className="break-all text-sm text-muted-foreground">
            Code sent to <span className="text-foreground">{sentTo}</span>
          </p>
          <label className="sr-only" htmlFor="auth-code">
            Six-digit code
          </label>
          <input
            id="auth-code"
            name="code"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className="h-16 w-full min-w-0 rounded-2xl border border-input bg-background/60 px-4 text-center text-2xl font-semibold tracking-[.4em] outline-none focus:border-primary"
          />
          <p className="text-center text-xs text-muted-foreground">
            {seconds
              ? `Expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
              : "Request a new code if yours has expired."}
          </p>
          <Button
            type="submit"
            disabled={locked || code.length !== 6}
            className="h-12 w-full rounded-xl"
          >
            {busy ? "Verifying…" : "Verify & sign in"}
          </Button>
          <div className="flex justify-between gap-3 text-xs">
            <button
              type="button"
              className="text-primary"
              disabled={locked}
              onClick={() => {
                setSentTo("");
                setCode("");
                setMessage("");
              }}
            >
              Change email
            </button>
            <button
              type="button"
              className="text-primary disabled:text-muted-foreground"
              disabled={locked || resendSeconds > 0}
              onClick={() => void sendCode()}
            >
              {resendSeconds ? `Resend in ${resendSeconds}s` : "Resend code"}
            </button>
          </div>
        </>
      ) : (
        <>
          <label htmlFor="auth-email" className="text-xs font-medium text-muted-foreground">
            Email address
          </label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            disabled={locked || !authFeatures.emailOtp}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="h-12 w-full min-w-0 rounded-xl border border-input bg-background/60 px-4 outline-none focus:border-primary disabled:opacity-50"
          />
          <Button
            type="submit"
            disabled={locked || !authFeatures.emailOtp}
            className="h-12 w-full rounded-xl"
          >
            <Mail className="size-4" />{" "}
            {busy
              ? "Sending…"
              : authFeatures.emailOtp
                ? "Send six-digit code"
                : "Email codes · setup pending"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            No password. Codes expire after 10 minutes.
          </p>
        </>
      )}
    </form>
  );
  const signInWallet = (index: number) =>
    void attempt(async () => {
      const wallet = wallets[index];
      if (!wallet) throw new Error("Choose an installed wallet.");
      await signInWithEthereumWallet(wallet.provider);
      await finish();
    });
  return (
    <div className="auth-panel min-w-0 bg-[#0f1827] px-7 pb-8 pt-14 text-white sm:px-11 sm:pt-16">
      <div className="text-center">
        <h1 className="text-[36px] font-semibold tracking-[-.025em] sm:text-[40px]">
          {user ? "Your account" : mode === "signup" ? "Create account" : "Sign in"}
        </h1>
      </div>
      {user ? (
        <div className="mt-7 space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black/10 p-4">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
            <span className="min-w-0 break-all text-sm">{user.email || "Wallet account"}</span>
          </div>
          <Button className="h-12 w-full rounded-full" onClick={() => void finish()}>
            Continue
          </Button>
          <Button
            variant="outline"
            className="h-12 w-full rounded-full border-white/25 bg-transparent"
            disabled={locked}
            onClick={() =>
              void attempt(async () => {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
              })
            }
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      ) : (
        <>
          <div className="auth-social mt-9 grid grid-cols-4 gap-2">
            <Button
              aria-label="Continue with Google"
              title={
                !authFeatures.google ? "Google is disabled in Supabase" : "Continue with Google"
              }
              variant="outline"
              className="h-14 rounded-full border-[#697180] bg-transparent text-base hover:bg-white/[.055]"
              disabled={locked || !authFeatures.google}
              onClick={() =>
                void attempt(async () => {
                  sessionStorage.setItem("tac-auth-next", safeAuthNext(next));
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: "google",
                    options: {
                      redirectTo: `${window.location.origin}/auth/callback`,
                      scopes: "openid email profile",
                    },
                  });
                  if (error) throw error;
                })
              }
            >
              <span aria-hidden="true" className="text-2xl font-bold">
                <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
                  <path d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.61 4.61 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.32 2.98-7.35ZM12 22c2.7 0 4.97-.89 6.63-2.42l-3.24-2.5c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.75-5.59-4.1H3.07v2.58A10 10 0 0 0 12 22ZM6.41 13.94a6 6 0 0 1 0-3.88V7.48H3.07a10 10 0 0 0 0 9.04l3.34-2.58ZM12 5.96c1.47 0 2.79.51 3.82 1.51l2.86-2.86A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.93 5.48l3.34 2.58A6 6 0 0 1 12 5.96Z" />
                </svg>
              </span>
            </Button>
            <Button
              aria-label="Continue with X"
              title={!authFeatures.x ? "X is disabled in Supabase" : "Continue with X"}
              variant="outline"
              className="h-14 rounded-full border-[#697180] bg-transparent text-base hover:bg-white/[.055]"
              disabled={locked || !authFeatures.x}
              onClick={() =>
                void attempt(async () => {
                  sessionStorage.setItem("tac-auth-next", safeAuthNext(next));
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: "twitter",
                    options: { redirectTo: `${window.location.origin}/auth/callback` },
                  });
                  if (error) throw error;
                })
              }
            >
              <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
                <path d="M18.9 2H22l-6.8 7.8L23.2 22H17l-4.85-7.35L5.7 22H2.55l7.2-8.24L1 2h6.35l4.4 6.65L18.9 2ZM17.5 20h1.7L6.35 3.9H4.52L17.5 20Z" />
              </svg>
            </Button>
            <FarcasterSignIn
              compact
              disabled={busy}
              onBusyChange={setFarcasterBusy}
              onSuccess={finish}
              onError={setMessage}
            />
            <Button
              aria-label="Sign-in options"
              variant="outline"
              className="h-14 rounded-full border-[#697180] bg-transparent text-2xl hover:bg-white/[.055]"
              onClick={() =>
                setMessage(
                  `Google: ${authFeatures.google ? "available" : "disabled in Supabase"} · Email: ${authFeatures.emailOtp ? "available" : "disabled in Supabase"} · X: ${authFeatures.x ? "available" : "disabled in Supabase"}. Wallet sign-in only requests a message signature, never a token approval.`,
                )
              }
            >
              •••
            </Button>
          </div>
          <Button
            variant="outline"
            className="mt-3 h-14 w-full rounded-full border-[#697180] bg-transparent text-base font-normal hover:bg-white/[.055]"
            disabled={locked}
            onClick={() => setShowEmail(!showEmail)}
          >
            Continue with Email
          </Button>
          {showEmail && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4">
              {emailForm}
            </div>
          )}
          <div className="my-8 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-white/25" />
            OR
            <span className="h-px flex-1 bg-white/25" />
          </div>
          <div className="space-y-3" aria-label="Wallet sign-in methods">
            {[
              { name: "MetaMask", key: "metamask" },
              { name: "Trust Wallet", key: "trust" },
              { name: "Argent", key: "argent" },
            ].map((brand) => {
              const index = wallets.findIndex((w) => w.name.toLowerCase().includes(brand.key));
              return (
                <Button
                  key={brand.key}
                  variant="outline"
                  className="h-14 w-full justify-between rounded-full border-[#697180] bg-transparent px-5 text-base font-normal hover:bg-white/[.055]"
                  disabled={locked}
                  onClick={() =>
                    index >= 0
                      ? signInWallet(index)
                      : setMessage(
                          `Open TacPredict in ${brand.name}’s browser or install its Ethereum wallet extension to sign in.`,
                        )
                  }
                >
                  <span>{brand.name}</span>
                  <span className="flex items-center gap-2">
                    {index >= 0 && (
                      <span className="rounded-md border border-blue-400 px-2 py-1 text-[10px] text-blue-400">
                        Installed
                      </span>
                    )}
                    <img src={`/brand/wallets/${brand.key}.svg`} alt="" className="size-7" />
                  </span>
                </Button>
              );
            })}
            {chooseWallet &&
              wallets.map((wallet, index) => (
                <Button
                  key={wallet.id}
                  variant="outline"
                  className="h-12 w-full justify-between rounded-full border-[#697180] bg-transparent px-5"
                  disabled={locked}
                  onClick={() => signInWallet(index)}
                >
                  <span>{wallet.name}</span>
                  <span className="text-xs text-blue-400">Installed</span>
                </Button>
              ))}
            <Button
              variant="outline"
              className="h-14 w-full justify-between rounded-full border-[#697180] bg-transparent px-5 text-base font-normal hover:bg-white/[.055]"
              disabled={locked}
              onClick={() => {
                setChooseWallet(!chooseWallet);
                if (!wallets.length)
                  setMessage(
                    "Open TacPredict in MetaMask/Trust Wallet’s browser, or install a compatible Ethereum wallet. WalletConnect QR is not configured yet.",
                  );
              }}
            >
              <span>
                {wallets.length
                  ? chooseWallet
                    ? "Show fewer wallets"
                    : "All wallets"
                  : "All wallets"}
              </span>
              <span className="rounded-full border border-primary/60 px-2 py-0.5 text-xs text-primary">
                {wallets.length || <Wallet className="size-4" />}
              </span>
            </Button>
          </div>
          <p className="mt-5 text-center text-xs text-slate-400">
            {mode === "signin" ? "New here? " : "Already have an account? "}
            <button
              disabled={locked}
              className="font-medium text-primary"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setSentTo("");
                setCode("");
                setMessage("");
              }}
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </>
      )}
      {message && (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 rounded-xl bg-white/5 p-3 text-sm leading-5 text-muted-foreground"
        >
          {message}
        </p>
      )}
      <div className="mt-9 flex items-center justify-center gap-1.5 text-xs text-slate-500">
        Powered by
        <span className="text-sm font-semibold text-slate-300">TacPredict</span>
      </div>
    </div>
  );
}
