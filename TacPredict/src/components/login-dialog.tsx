import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AuthPanel } from "@/components/auth-panel";
import { supabase } from "@/integrations/supabase/client";
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
          className="login-popup fixed bottom-0 left-0 top-auto z-[80] block max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto overscroll-contain rounded-t-[30px] border-white/15 bg-[#0f1827] p-0 pb-[env(safe-area-inset-bottom)] text-white shadow-2xl sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-[460px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[32px]"
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
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSignedIn(Boolean(data.session));
      })
      .catch(() => {});
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <Button
      onClick={() => showLogin()}
      className="h-10 rounded-full bg-white px-6 text-sm font-semibold text-[#10171c] shadow-sm hover:bg-white/90"
    >
      {signedIn ? "Account" : "Login"}
    </Button>
  );
}
