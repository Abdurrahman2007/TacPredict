import { BRAND_LOGO_URL } from "@/lib/brand";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, LogOut, Wallet } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { useLoginDialog } from "@/components/login-dialog";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { safeAuthNext } from "@/lib/auth-config";
import { shortAddress } from "@/lib/onchain/base";

/**
 * Wallets-only auth surface. No email / Google / X / social login.
 * RainbowKit modal is the wallet chooser (MetaMask, Coinbase, Rainbow, Rabby, Trust, WC, Farcaster).
 */
export function AuthPanel({
  next = "/",
  onSuccess,
}: {
  next?: "/" | "/rewards" | "/profile";
  onSuccess?: () => void;
}) {
  const navigate = useNavigate();
  const openWallet = useLoginDialog();
  const wallet = useBaseWallet();
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
    if (!user || !wallet.address) return;
    if (onSuccess) onSuccess();
    else void navigate({ to: safeAuthNext(next) });
  }, [user, wallet.address, onSuccess, navigate, next]);

  const finish = async () => {
    if (onSuccess) onSuccess();
    else await navigate({ to: safeAuthNext(next) });
  };

  return (
    <div className="auth-panel auth-compact min-w-0 bg-[#0f1827] px-6 pb-6 pt-9 text-white sm:px-8">
      <div className="text-center">
        <img src={BRAND_LOGO_URL} alt="TacPredict" className="mx-auto mb-3 size-11 rounded-xl" />
        <h1 className="text-[28px] font-semibold tracking-[-.025em]">
          {user || wallet.address ? "Your wallet" : "Connect wallet"}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Non-custodial wallets only on Base. No email or social login.
        </p>
      </div>

      {user || wallet.address ? (
        <div className="mt-7 space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black/10 p-4">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
            <span className="min-w-0 break-all text-sm">
              {wallet.address ? shortAddress(wallet.address) : "Signed in"}
            </span>
          </div>
          <div className="flex justify-center">
            <WalletConnectButton />
          </div>
          <Button className="h-12 w-full rounded-full" onClick={() => void finish()}>
            Continue
          </Button>
          <Button
            variant="outline"
            className="h-12 w-full rounded-full border-white/25 bg-transparent"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                setMessage("");
                try {
                  wallet.disconnect();
                  const { error } = await supabase.auth.signOut();
                  if (error) throw error;
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : "Sign-out failed");
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            Sign out
          </Button>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          <div className="flex justify-center">
            <WalletConnectButton />
          </div>
          <Button
            variant="outline"
            className="h-14 w-full justify-between rounded-full border-[#697180] bg-transparent px-5 text-base font-normal hover:bg-white/[.055]"
            onClick={() => {
              sessionStorage.setItem("tac-auth-next", safeAuthNext(next));
              openWallet(next);
            }}
          >
            <span>Choose a wallet</span>
            <Wallet className="size-5 text-primary" />
          </Button>
          <ul className="space-y-1.5 text-center text-xs text-slate-500">
            <li>MetaMask · Coinbase · Rainbow · Rabby · Trust</li>
            <li>WalletConnect QR · Farcaster Frame</li>
            <li>Network: Base Mainnet (8453) · Collateral: USDC</li>
          </ul>
        </div>
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
