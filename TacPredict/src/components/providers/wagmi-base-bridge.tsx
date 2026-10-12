import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import type { WalletProvider } from "@/lib/onchain/wallet";
import { signInWithEthereumWallet } from "@/lib/onchain/wallet-auth";
import { supabase } from "@/integrations/supabase/client";
import { sessionMatchesWallet } from "@/lib/onchain/wallet-session.mjs";

// Shared across React remounts: one login attempt per connection, including rejection.
const attempted = new Set<string>();
const pending = new Map<string, Promise<void>>();

/**
 * Keeps legacy BaseWalletProvider in sync with RainbowKit/Wagmi,
 * then SIWE into Supabase once per address (no email/social).
 */
export function WagmiBaseBridge() {
  const { address, isConnected, connector, chainId, status } = useAccount();
  const { address: baseAddress, connect, disconnect } = useBaseWallet();
  const siweDone = useRef<string | null>(null);
  const bridging = useRef(false);

  useEffect(() => {
    if (status === "disconnected") {
      if (siweDone.current) attempted.delete(siweDone.current);
      siweDone.current = null;
      if (baseAddress) disconnect();
      return;
    }

    if (!isConnected || !address || !connector || bridging.current) return;

    bridging.current = true;
    void (async () => {
      try {
        const provider = (await connector.getProvider()) as WalletProvider | undefined;
        if (!provider?.request) return;

        if (baseAddress?.toLowerCase() !== address.toLowerCase()) {
          await connect({
            id: connector.id,
            name: connector.name || "Wallet",
            provider,
          });
        }

        const key = address.toLowerCase();
        if (siweDone.current === key) return;

        const { data } = await supabase.auth.getSession();
        if (!sessionMatchesWallet(data.session, key)) {
          const inFlight = pending.get(key);
          if (inFlight) await inFlight;
          else if (!attempted.has(key)) {
            attempted.add(key);
            siweDone.current = key;
            const login = signInWithEthereumWallet(provider).then(() => undefined);
            pending.set(key, login);
            try {
              await login;
            } finally {
              pending.delete(key);
            }
          } else return; // Never repeatedly open signatures after cancellation.
        }
        siweDone.current = key;

        const next = sessionStorage.getItem("tac-auth-next");
        if (next) {
          sessionStorage.removeItem("tac-auth-next");
          if (next.startsWith("/") && !next.startsWith("//")) {
            window.location.assign(next);
          }
        }
      } catch (error) {
        console.error("[web3] wallet bridge failed", error);
      } finally {
        bridging.current = false;
      }
    })();
  }, [address, baseAddress, isConnected, connector, chainId, status, connect, disconnect]);

  return null;
}
