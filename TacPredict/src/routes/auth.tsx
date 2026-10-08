import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, LogOut, Mail, ShieldCheck, Wallet } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { supabase } from "@/integrations/supabase/client";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { FarcasterSignIn } from "@/components/farcaster-sign-in";
import { signInWithEthereumWallet } from "@/lib/onchain/wallet-auth";
import { safeAuthNext, authFeatures } from "@/lib/auth-config";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({ next: safeAuthNext(search["next"]) }),
  head: () => ({
    meta: [
      { title: "Sign in — TacPredict" },
      {
        name: "description",
        content:
          "Sign in securely to TacPredict. Your account and self-custodial wallet stay separate.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
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
    await navigate({ to: safeAuthNext(next) });
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
    <section className="mx-auto max-w-[440px] py-3 sm:py-10">
      <Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Back home
      </Link>
      <div className="overflow-hidden rounded-[32px] border border-white/15 bg-[#111b29] p-6 shadow-[0_24px_80px_-30px_rgba(0,0,0,.8)] sm:p-9">
        <div className="text-center">
          <BrandMark className="mx-auto mb-4 size-14" />
          <p className="mb-3 text-xs font-semibold tracking-[.14em] text-primary">TACPREDICT</p>
          <h1 className="text-[32px] font-semibold tracking-tight">
            {user ? "Your account" : mode === "signup" ? "Create account" : "Sign in"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {user ? "You’re signed in securely." : "Your predictions. Your rewards. Your wallet."}
          </p>
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
            <div className="mt-7 grid grid-cols-3 gap-2">
              <Button
                aria-label="Continue with Google"
                title={!authFeatures.google ? "Google OAuth setup pending" : "Continue with Google"}
                variant="outline"
                className="h-14 rounded-full border-white/35 bg-transparent text-base hover:bg-white/5"
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
                  G
                </span>
                Google
              </Button>
              <Button
                aria-label="Continue with X"
                title={!authFeatures.x ? "X OAuth setup pending" : "Continue with X"}
                variant="outline"
                className="h-14 rounded-full border-white/35 bg-transparent text-base hover:bg-white/5"
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
                𝕏
              </Button>
              <FarcasterSignIn
                compact
                disabled={busy}
                onBusyChange={setFarcasterBusy}
                onSuccess={finish}
                onError={setMessage}
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
              <span>Google</span>
              <span>X</span>
              <span>Farcaster</span>
            </div>
            {(!authFeatures.google || !authFeatures.x) && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                {[!authFeatures.google && "Google", !authFeatures.x && "X"]
                  .filter(Boolean)
                  .join(" / ")}{" "}
                · setup pending
              </p>
            )}
            <Button
              variant="outline"
              className="mt-3 h-14 w-full rounded-full border-white/35 bg-transparent text-[15px] hover:bg-white/5"
              disabled={locked}
              onClick={() => setShowEmail(!showEmail)}
            >
              <Mail className="size-4" />
              Continue with Email
            </Button>
            {showEmail && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4">
                {emailForm}
              </div>
            )}
            <div className="my-7 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-white/25" />
              OR
              <span className="h-px flex-1 bg-white/25" />
            </div>
            <div className="space-y-3" aria-label="Wallet sign-in methods">
              {wallets.slice(0, chooseWallet ? undefined : 2).map((wallet, index) => (
                <Button
                  key={wallet.id}
                  variant="outline"
                  className="h-14 w-full justify-between rounded-full border-white/35 bg-transparent px-5 hover:bg-white/5"
                  disabled={locked}
                  onClick={() => signInWallet(index)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Wallet className="size-5 shrink-0 text-primary" />
                    <span className="truncate">{wallet.name}</span>
                  </span>
                  <span className="ml-2 rounded-lg border border-primary/60 px-2 py-1 text-[10px] font-medium text-primary">
                    Installed
                  </span>
                </Button>
              ))}
              <Button
                variant="outline"
                className="h-14 w-full justify-between rounded-full border-white/35 bg-transparent px-5 hover:bg-white/5"
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
                      : "All installed wallets"
                    : "Sign in with wallet"}
                </span>
                <span className="rounded-full border border-primary/60 px-2 py-0.5 text-xs text-primary">
                  {wallets.length || <Wallet className="size-4" />}
                </span>
              </Button>
            </div>
            <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
              Approve a sign-in message only. No transaction or token approval.
            </p>
            <p className="mt-6 text-center text-sm text-muted-foreground">
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
        <div className="mt-6 flex items-start gap-2 border-t border-white/10 pt-4 text-[11px] leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            Secured by Supabase · Account login and “Connect wallet” are separate. TAC Points have
            no cash value. USDC trading and transfers remain disabled.
          </span>
        </div>
      </div>
    </section>
  );
}
