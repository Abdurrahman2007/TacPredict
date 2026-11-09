import { useCallback, useState } from "react";
import { useLoginDialog } from "@/components/login-dialog";
import { type AuthNext } from "@/lib/auth-config";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { signInWithEthereumWallet } from "@/lib/onchain/wallet-auth";
import { markSiweAttempt } from "@/lib/onchain/siwe-attempt.mjs";
import { ACCESS_LABEL, walletAccess } from "@/lib/onchain/wallet-access.mjs";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { showWalletNotice } from "@/lib/wallet-notice";

/**
 * One answer to "can this person use wallet features yet?" for every page.
 * `run()` opens the connect modal only when no wallet is connected. A connected wallet that has no
 * session yet gets a single sign-in signature instead, never another connect prompt.
 */
export function useWalletAccess(next: AuthNext = "/") {
  const wallet = useBaseWallet();
  const auth = useProtocolUser();
  const login = useLoginDialog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // While wagmi is still restoring a stored connection, the wallet is
  // neither "connected" nor "disconnected" yet. Treat it as its own state:
  // run() must open neither the connect modal nor a signature request,
  // and buttons must show a neutral loading label instead of "Connect".
  const restoring = wallet.restoring;
  const state = walletAccess({ address: wallet.address, signedIn: Boolean(auth.user) });
  const { provider, address, chainId } = wallet;

  /**
   * Signs the connected wallet in when it has no session yet. `ok` is true when the wallet ends up signed in (or
   * already was); otherwise `message` says why (empty when nothing went wrong, e.g. the connect modal opened).
   */
  const run = useCallback(async (): Promise<{ ok: true } | { ok: false; message: string }> => {
    setError("");
    if (restoring) return { ok: false, message: "" };
    if (state === "connect") {
      login(next);
      return { ok: false, message: "" };
    }
    if (state !== "verify") return { ok: true };
    const fail = (message: string) => {
      setError(message);
      showWalletNotice(message);
      return { ok: false as const, message };
    };
    if (!provider) return fail("Your wallet is still starting. Try again in a moment.");
    setBusy(true);
    try {
      if (address) markSiweAttempt(address);
      await signInWithEthereumWallet(provider, address, chainId);
      return { ok: true };
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "";
      return fail(
        text.length > 0 && text.length < 220
          ? text
          : "Verification was not completed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [restoring, state, provider, address, chainId, login, next]);

  return {
    state,
    restoring,
    busy,
    error,
    run,
    ready: auth.ready,
    label: restoring ? "Connecting…" : busy ? "Waiting for wallet…" : ACCESS_LABEL[state],
  };
}
