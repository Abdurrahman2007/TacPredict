import { useCallback, useState } from "react";
import { useLoginDialog } from "@/components/login-dialog";
import { type AuthNext } from "@/lib/auth-config";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { signInWithEthereumWallet } from "@/lib/onchain/wallet-auth";
import { ACCESS_LABEL, walletAccess } from "@/lib/onchain/wallet-access.mjs";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";

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
  const state = walletAccess({ address: wallet.address, signedIn: Boolean(auth.user) });
  const { provider, address } = wallet;

  const run = useCallback(async () => {
    setError("");
    if (state === "connect") {
      login(next);
      return;
    }
    if (state !== "verify") return;
    if (!provider) {
      setError("Your wallet is still starting. Try again in a moment.");
      return;
    }
    setBusy(true);
    try {
      await signInWithEthereumWallet(provider, address);
    } catch {
      setError("Verification was not completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [state, provider, address, login, next]);

  return {
    state,
    busy,
    error,
    run,
    ready: auth.ready,
    label: busy ? "Waiting for wallet…" : ACCESS_LABEL[state],
  };
}
