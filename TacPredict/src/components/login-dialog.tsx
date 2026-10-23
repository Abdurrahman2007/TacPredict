import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { useWeb3Ready } from "@/components/providers/web3-ready";
import { safeAuthNext, type AuthNext } from "@/lib/auth-config";

type Next = AuthNext;
const LoginContext = createContext<(next?: Next) => void>(() => {});

export const useLoginDialog = () => useContext(LoginContext);

type OpenEffectProps = {
  pendingNext: Next | null;
  clearPending: () => void;
  openRef: MutableRefObject<(next?: Next) => void>;
};

/**
 * Opens RainbowKit wallets-only connect modal (no email/social AuthPanel).
 * RainbowKit is loaded only after Web3Ready to keep SSR clean.
 */
export function LoginDialogProvider({ children }: { children: ReactNode }) {
  const web3Ready = useWeb3Ready();
  const [pendingNext, setPendingNext] = useState<Next | null>(null);
  const openRef = useRef<(next?: Next) => void>(() => {});
  const [OpenEffect, setOpenEffect] = useState<ComponentType<OpenEffectProps> | null>(null);

  useEffect(() => {
    if (!web3Ready) return;
    let cancelled = false;
    void import("./login-open-effect").then((mod) => {
      if (!cancelled) setOpenEffect(() => mod.LoginOpenEffect);
    });
    return () => {
      cancelled = true;
    };
  }, [web3Ready]);

  const open = useCallback(
    (target: Next = "/") => {
      const next = safeAuthNext(target);
      sessionStorage.setItem("tac-auth-next", next);
      if (web3Ready && OpenEffect) openRef.current(next);
      else setPendingNext(next);
    },
    [web3Ready, OpenEffect],
  );

  return (
    <LoginContext.Provider value={open}>
      {children}
      {OpenEffect ? (
        <OpenEffect
          pendingNext={pendingNext}
          clearPending={() => setPendingNext(null)}
          openRef={openRef}
        />
      ) : null}
    </LoginContext.Provider>
  );
}

/** Header control: RainbowKit Connect Wallet / address + Base USDC. */
export function LoginButton() {
  return <WalletConnectButton />;
}
