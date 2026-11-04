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

/** A wallet that never answers must not block the bridge for good. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("wallet provider timeout")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Keeps legacy BaseWalletProvider in sync with RainbowKit/Wagmi.
 *
 * wagmi is the single source of truth for "is a wallet connected". The account is mirrored with
 * `adopt`, which never calls eth_requestAccounts: once the person has connected, no page asks them
 * to connect again, not after a reload, a route change or a restored session.
 *
 * A signature request (SIWE) is only ever opened right after the person
 * connects a wallet in this page view. Wagmi silently restoring a previous
 * connection on page load/reload (`isReconnected`) must NEVER open a wallet
 * popup or navigate: with Coinbase Smart Wallet that opened keys.coinbase.com
 * on every app start. Signed-out wallets can sign in from the Portfolio page.
 */
export function WagmiBaseBridge() {
  const { address, isConnected, connector, chainId, status } = useAccount();
  const { address: baseAddress, adopt, disconnect, settleWagmi } = useBaseWallet();
  const router = useRouter();
  const siweDone = useRef<string | null>(null);
  const bridging = useRef<string | null>(null);
  const freshConnect = useRef(false);

  useAccountEffect({
    onConnect({ isReconnected }) {
      freshConnect.current = !isReconnected;
    },
    onDisconnect() {
      freshConnect.current = false;
    },
  });

  // 1. Mirror the connected account right away; pages read it from useBaseWallet().
  useEffect(() => {
    if (status === "disconnected") {
      // Definitive, even when there is no address to clear: without this,
      // a genuinely disconnected user would stay "restoring" forever and
      // never see a Connect control at all.
      if (baseAddress) disconnect();
      else settleWagmi();
      return;
    }
    if (isConnected && address) adopt({ address, chainId: chainId ?? null });
  }, [status, isConnected, address, chainId, baseAddress, adopt, disconnect, settleWagmi]);

  // 1b. A wallet provider that never answers must not freeze the UI in
  // "restoring" forever. After 10s, fall back to the settled disconnected
  // state so the user can click Connect again; a later wagmi connect
  // still adopts normally through effect 1.
  useEffect(() => {
    if (status !== "reconnecting" && status !== "connecting") return;
    const timer = window.setTimeout(() => settleWagmi(), 10_000);
    return () => window.clearTimeout(timer);
  }, [status, settleWagmi]);

  // 2. Attach the wallet provider (needed to send transactions) and run the one-time sign-in.
  useEffect(() => {
    if (status === "disconnected") {
      if (siweDone.current) attempted.delete(siweDone.current);
      siweDone.current = null;
      return;
    }

    if (!isConnected || !address || !connector) return;
    const key = address.toLowerCase();
    if (bridging.current === key) return;

    bridging.current = key;
    void (async () => {
      try {
        const provider = (await withTimeout(connector.getProvider(), 8000)) as
          | WalletProvider
          | undefined;
        if (!provider?.request) return;

        adopt({ address, chainId: chainId ?? null, provider });

        // The administrator workspace signs in with email + password and authenticator. A wallet
        // connected there only signs contract transactions; a wallet sign-in would replace the
        // admin session, so it is never requested on /admin pages.
        const path = window.location.pathname;
        if (path === "/admin" || path.startsWith("/admin/")) return;

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
            const login = signInWithEthereumWallet(provider, address).then(() => undefined);
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
        bridging.current = null;
      }
    })();
  }, [address, isConnected, connector, chainId, status, adopt, router]);

  return null;
}
