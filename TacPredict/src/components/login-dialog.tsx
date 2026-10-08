import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AuthPanel } from "@/components/auth-panel";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { BASE_NETWORK, formatUsdc, isAddress, shortAddress } from "@/lib/onchain/base";
import { Button } from "@/components/ui/button";
type Next = "/" | "/rewards" | "/profile";
const LoginContext = createContext<(next?: Next) => void>(() => {});
export const useLoginDialog = () => useContext(LoginContext);
export function LoginDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState<Next>("/");
  return (
    <LoginContext.Provider
      value={(target = "/") => {
        setNext(target);
        setOpen(true);
      }}
    >
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          overlayClassName="z-[70] bg-black/70 backdrop-blur-sm"
          className="login-popup fixed bottom-0 left-0 top-auto z-[80] block max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto overscroll-contain rounded-t-[30px] border-[#36404e] bg-[#0f1827] p-0 pb-[env(safe-area-inset-bottom)] text-white shadow-2xl sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-[400px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[32px]"
        >
          <DialogTitle className="sr-only">TacPredict sign in</DialogTitle>
          <DialogDescription className="sr-only">
            Sign in with your email, social account or Ethereum wallet.
          </DialogDescription>
          <AuthPanel next={next} onSuccess={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </LoginContext.Provider>
  );
}
export function LoginButton() {
  const showLogin = useLoginDialog();
  const [user, setUser] = useState<User | null>(null);
  const wallet = useBaseWallet();
  useEffect(() => {
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setUser(data.session?.user ?? null);
      })
      .catch(() => {});
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const displayName = [
    user?.user_metadata?.["full_name"],
    user?.user_metadata?.["name"],
    user?.user_metadata?.["display_name"],
  ].find((v): v is string => typeof v === "string" && v.trim().length > 0);
  const claims = user?.user_metadata?.["custom_claims"] as Record<string, unknown> | undefined;
  const identities =
    user?.identities?.flatMap((i) => [i.identity_data?.["address"], i.identity_data?.["sub"]]) ??
    [];
  const walletIdentity = [...identities, claims?.["address"]].find(isAddress);
  const address = wallet.address ?? (isAddress(walletIdentity) ? walletIdentity : null);
  const label = address
    ? shortAddress(address)
    : displayName?.trim().split(/\s+/)[0]?.slice(0, 18) ||
      user?.email?.split("@")[0]?.slice(0, 18) ||
      "Signed in";
  const balance =
    user && wallet.address && wallet.chainId === BASE_NETWORK.id
      ? `${formatUsdc(wallet.usdc)} USDC`
      : null;
  return (
    <Button
      onClick={() => showLogin()}
      aria-label={user ? "Open your account" : "Login"}
      className={
        user
          ? "h-11 max-w-[180px] gap-2 rounded-full border border-white/10 bg-card px-3 text-foreground shadow-sm hover:bg-secondary"
          : "h-10 rounded-full bg-white px-6 text-sm font-semibold text-[#10171c] shadow-sm hover:bg-white/90"
      }
    >
      {user ? (
        <>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {label.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-xs font-semibold">{balance ?? label}</span>
            <span className="block truncate text-[10px] font-normal text-muted-foreground">
              {balance ? label : address ? "Wallet connected" : "Signed in"}
            </span>
          </span>
        </>
      ) : (
        "Login"
      )}
    </Button>
  );
}
