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
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
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
  const wallet = useBaseWallet();
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

  // The connect modal may open only for a definitively disconnected wallet.
  // A connected wallet must never see it (gated actions use a SIWE signature
  // instead, via useWalletAccess), and a still-restoring wallet must not
  // see it either: its connection is about to reappear on its own.
  const canOpenModal = web3Ready && Boolean(OpenEffect) && !wallet.restoring && !wallet.address;

  const open = useCallback(
    (target: Next = "/") => {
      const next = safeAuthNext(target);
      sessionStorage.setItem("tac-auth-next", next);
      if (wallet.address) {
        // Never let a stale pending request fire later, after a disconnect.
        setPendingNext(null);
        return;
      }
      if (canOpenModal) openRef.current(next);
      else setPendingNext(next);
    },
    [canOpenModal, wallet.address],
  );

  // A click that landed while wagmi was still restoring is honoured only
  // once the restore has settled — and only if the wallet is still
  // disconnected at that moment. If the connection reappeared, the
  // pending request is dropped silently: no modal, no signature.
  useEffect(() => {
    if (!pendingNext || !canOpenModal) return;
    openRef.current(pendingNext);
    setPendingNext(null);
  }, [pendingNext, canOpenModal]);

  // Drop a pending request as soon as a connection appears, so it can
  // never fire a modal later, after a subsequent disconnect.
  useEffect(() => {
    if (pendingNext && wallet.address) setPendingNext(null);
  }, [pendingNext, wallet.address]);

  return (
    <LoginContext.Provider value={open}>
      {children}
      {OpenEffect ? (
        <OpenEffect
          pendingNext={null}
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
