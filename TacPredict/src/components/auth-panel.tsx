import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, LogOut, Mail, Wallet } from "lucide-react";
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
  const { wallets, connect } = useBaseWallet();
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [useExistingCode, setUseExistingCode] = useState(false);
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [chooseWallet, setChooseWallet] = useState(false);
  const verificationStep = !!sentTo || useExistingCode;
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
            ? "Email delivery failed. Check the project’s SMTP sender/template configuration, or try Google or wallet sign-in."
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
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      const now = Date.now();
      setUseExistingCode(false);
      setSentTo(target);
      setCode("");
      setClock(now);
      setExpiresAt(now + 600_000);
      setResendAt(now + 60_000);
      setMessage("Check your inbox for your six-digit code.");
    });
  const verifyCode = (token = code) =>
    attempt(async () => {
      if (!/^\d{6}$/.test(token)) throw new Error("Enter the six-digit code from your email.");
      const target = sentTo || email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target))
        throw new Error("Enter the email that received this code.");
      const { error } = await supabase.auth.verifyOtp({
        email: target,
        token,
        type: "email",
      });
      if (error)
        throw new Error("This code is invalid or expired. Check your email or request a new code.");
      setCode("");
      await finish();
    });

  const resetEmailStep = () => {
    setUseExistingCode(false);
    setSentTo("");
    setCode("");
    setMessage("");
  };
  const emailForm = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void sendCode();
      }}
    >
      <label htmlFor="auth-email" className="sr-only">
        Email address
      </label>
      <div className="auth-email-entry">
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
          placeholder="Enter your email"
        />
        <button
          type="submit"
          aria-label="Send verification code"
          disabled={locked || !authFeatures.emailOtp || !email.trim()}
          className="auth-email-arrow"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
        </button>
      </div>
    </form>
  );
  if (!user && verificationStep)
    return (
      <div className="auth-panel auth-verification bg-[#0f1827] text-white">
        <button
          type="button"
          aria-label="Back to sign in"
          disabled={locked}
          onClick={resetEmailStep}
          className="auth-back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="auth-envelope" aria-hidden="true">
          <Mail className="size-10" strokeWidth={1.4} />
        </div>
        <h1 className="text-center text-2xl font-semibold tracking-tight">Email verification</h1>
        <p className="mt-3 text-center text-sm leading-6 text-slate-400">
          Enter the 6-digit verification code
          {sentTo ? (
            <>
              {" "}
              sent to
              <br />
              <span className="break-all text-slate-200">{sentTo}</span>
            </>
          ) : (
            " from your email."
          )}
        </p>
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            void verifyCode();
          }}
        >
          {useExistingCode && (
            <>
              <label htmlFor="auth-email" className="sr-only">
                Email address
              </label>
              <input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email that received the code"
                className="mb-4 h-11 w-full rounded-full border border-white/30 bg-transparent px-4 text-sm outline-none focus:border-blue-400"
              />
            </>
          )}
          <label htmlFor="auth-code" className="sr-only">
            Six-digit code
          </label>
          <div className="auth-code-control">
            <input
              id="auth-code"
              name="code"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              disabled={locked}
              value={code}
              onChange={(event) => {
                const token = event.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(token);
                if (
                  token.length === 6 &&
                  (!useExistingCode || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
                )
                  void verifyCode(token);
              }}
            />
            <div className="auth-code-digits" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className={code.length === i ? "is-current" : ""}>
                  {code[i] || ""}
                </span>
              ))}
            </div>
          </div>
          {busy && (
            <p role="status" className="mt-4 flex justify-center gap-2 text-sm text-slate-400">
              <Loader2 className="size-4 animate-spin" />
              Verifying…
            </p>
          )}
          {!busy && code.length === 6 && (
            <button type="submit" className="mt-4 w-full text-sm text-blue-400">
              Verify & sign in
            </button>
          )}
        </form>
        {sentTo && (
          <button
            type="button"
            disabled={locked || resendSeconds > 0}
            onClick={() => void sendCode()}
            className="mt-5 block w-full text-center text-sm text-blue-400 disabled:text-slate-400"
          >
            {resendSeconds ? `Resend in ${resendSeconds} seconds` : "Resend code"}
          </button>
        )}
        <p className="mt-3 text-center text-[11px] text-slate-500">
          {seconds
            ? `Code expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
            : "Codes expire 10 minutes after sending."}
        </p>
        {message && !message.startsWith("Check your inbox") && (
          <p
            role="status"
            aria-live="polite"
            className="mt-4 rounded-xl bg-white/5 p-3 text-sm text-slate-300"
          >
            {message}
          </p>
        )}
        <div className="mt-7 text-center text-xs text-slate-500">
          Powered by <span className="font-semibold text-slate-300">TacPredict</span>
        </div>
      </div>
    );
  const signInWallet = (index: number) =>
    void attempt(async () => {
      const wallet = wallets[index];
      if (!wallet) throw new Error("Choose an installed wallet.");
      await signInWithEthereumWallet(wallet.provider);
      await connect(wallet);
      await finish();
    });
  return (
    <div className="auth-panel auth-compact min-w-0 bg-[#0f1827] px-6 pb-6 pt-9 text-white sm:px-8">
      <div className="text-center">
        <img
          src="/brand/tacpredict.svg"
          alt="TacPredict"
          className="mx-auto mb-3 size-11 rounded-xl"
        />
        <h1 className="text-[28px] font-semibold tracking-[-.025em]">
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
          <div className="auth-social mt-6 grid grid-cols-4 gap-2">
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
                    provider: authFeatures.xProvider,
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
          <div className="mt-3">{emailForm}</div>
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              setUseExistingCode(true);
              setCode("");
              setMessage("");
            }}
            className="mt-2 block w-full text-center text-[11px] text-slate-400 hover:text-white"
          >
            Already have a code?
          </button>
          <div className="my-5 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-white/25" />
            OR
            <span className="h-px flex-1 bg-white/25" />
          </div>
          <div className="space-y-2.5" aria-label="Wallet sign-in methods">
            <Button
              variant="outline"
              className="h-14 w-full justify-between rounded-full border-[#697180] bg-transparent px-5 text-base font-normal hover:bg-white/[.055]"
              disabled={locked}
              onClick={() =>
                void attempt(async () => {
                  const installed = wallets.find((w) => /coinbase/i.test(w.name));
                  const provider =
                    installed?.provider ??
                    (await import("@/lib/onchain/coinbase-auth").then((m) =>
                      m.getCoinbaseAuthProvider(),
                    ));
                  if (!provider)
                    throw new Error("Coinbase Wallet is unavailable. Please try again.");
                  await signInWithEthereumWallet(provider);
                  await connect(
                    installed ?? { id: "coinbase-sdk", name: "Coinbase Wallet", provider },
                  );
                  await finish();
                })
              }
            >
              <span>Coinbase Wallet</span>
              <img src="/brand/providers/coinbase.svg" className="size-7 rounded-lg" alt="" />
            </Button>
            <FarcasterSignIn
              disabled={busy}
              onBusyChange={setFarcasterBusy}
              onSuccess={finish}
              onError={setMessage}
              walletRow
            />
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
            {wallets.length > 0 && (
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
            )}
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
      <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-500">
        Powered by
        <span className="text-sm font-semibold text-slate-300">TacPredict</span>
      </div>
    </div>
  );
}
