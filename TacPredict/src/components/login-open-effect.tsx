import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, type MutableRefObject } from "react";
import { safeAuthNext, type AuthNext } from "@/lib/auth-config";

type Next = AuthNext;

/** Client-only: opens RainbowKit connect modal for useLoginDialog(). */
export function LoginOpenEffect({
  pendingNext,
  clearPending,
  openRef,
}: {
  pendingNext: Next | null;
  clearPending: () => void;
  openRef: MutableRefObject<(next?: Next) => void>;
}) {
  const { openConnectModal } = useConnectModal();

  openRef.current = (target: Next = "/") => {
    sessionStorage.setItem("tac-auth-next", safeAuthNext(target));
    openConnectModal?.();
  };

  useEffect(() => {
    if (!pendingNext || !openConnectModal) return;
    sessionStorage.setItem("tac-auth-next", safeAuthNext(pendingNext));
    openConnectModal();
    clearPending();
  }, [pendingNext, openConnectModal, clearPending]);

  return null;
}
