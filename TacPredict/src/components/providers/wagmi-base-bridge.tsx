import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useAccount, useAccountEffect } from "wagmi";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import type { WalletProvider } from "@/lib/onchain/wallet";
import { signInWithEthereumWallet } from "@/lib/onchain/wallet-auth";
import { shouldRequestWalletSignIn } from "@/lib/onchain/wallet-signin-policy.mjs";
import { supabase } from "@/integrations/supabase/client";
import { sessionMatchesWallet } from "@/lib/onchain/wallet-session.mjs";
import { safeAuthNext } from "@/lib/auth-config";

// Shared across React remounts: one login attempt per connection, including rejection.
const attempted = new Set<string>();
const pending = new Map<string, Promise<void>>();

/**
 * Keeps legacy BaseWalletProvider in sync with RainbowKit/Wagmi.
 *
 * A signature request (SIWE) is only ever opened right after the person
 * connects a wallet in this page view. Wagmi silently restoring a previous
 * connection on page load/reload (`isReconnected`) must NEVER open a wallet
 * popup or navigate: with Coinbase Smart Wallet that opened keys.coinbase.com
 * on every app start. Signed-out wallets can sign in from the Portfolio page.
 */
export function WagmiBaseBridge() {
  const { address, isConnected, connector, chainId, status } = useAccount();
  const { address: baseAddress, connect, disconnect } = useBaseWallet();
  const router = useRouter();
  const siweDone = useRef<string | null>(null);
  const bridging = useRef(false);
  const freshConnect = useRef(false);

  useAccountEffect({
    onConnect({ isReconnected }) {
      freshConnect.current = !isReconnected;
    },
    onDisconnect() {
      freshConnect.current = false;
    },
  });

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
        const signedIn = sessionMatchesWallet(data.session, key);
        const decision = shouldRequestWalletSignIn({
          freshConnect: freshConnect.current,
          signedIn,
          alreadyAttempted: attempted.has(key),
        });

        // Restored connection: read-only. No signature request, no redirect.
        if (decision === "skip") return;

        if (decision === "sign") {
          const inFlight = pending.get(key);
          if (inFlight) await inFlight;
          else {
            attempted.add(key);
            siweDone.current = key;
            const login = signInWithEthereumWallet(provider).then(() => undefined);
            pending.set(key, login);
            try {
              await login;
            } finally {
              pending.delete(key);
            }
          }
        }
        siweDone.current = key;
        freshConnect.current = false;

        const next = sessionStorage.getItem("tac-auth-next");
        if (next) {
          sessionStorage.removeItem("tac-auth-next");
          const target = safeAuthNext(next);
          if (next === target && target !== window.location.pathname) {
            void router.navigate({ to: target });
          }
        }
      } catch (error) {
        console.error("[web3] wallet bridge failed", error);
      } finally {
        bridging.current = false;
      }
    })();
  }, [address, baseAddress, isConnected, connector, chainId, status, connect, disconnect, router]);

  return null;
}
