import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useAccount, useAccountEffect } from "wagmi";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import type { WalletProvider } from "@/lib/onchain/wallet";
import { signInWithEthereumWallet } from "@/lib/onchain/wallet-auth";
import { shouldRequestWalletSignIn } from "@/lib/onchain/wallet-signin-policy.mjs";
import {
  hasSiweAttempt,
  markSiweAttempt,
} from "@/lib/onchain/siwe-attempt.mjs";
import { supabase } from "@/integrations/supabase/client";
import { sessionMatchesWallet } from "@/lib/onchain/wallet-session.mjs";
import { safeAuthNext } from "@/lib/auth-config";
import { showWalletNotice } from "@/lib/wallet-notice";

// In-memory + sessionStorage: one login attempt per wallet per tab session.
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
  const disconnectTimer = useRef<number | null>(null);

  useAccountEffect({
    onConnect({ isReconnected }) {
      freshConnect.current = !isReconnected;
    },
    onDisconnect() {
      freshConnect.current = false;
    },
  });

  // 1. Mirror the connected account right away; pages read it from useBaseWallet().
  // Brief "disconnected" flaps (leaving a wallet app / Android back) must NOT clear
  // the address immediately — that made the header ask to Connect again.
  useEffect(() => {
    if (disconnectTimer.current != null) {
      window.clearTimeout(disconnectTimer.current);
      disconnectTimer.current = null;
    }
    if (status === "disconnected") {
      disconnectTimer.current = window.setTimeout(() => {
        disconnectTimer.current = null;
        if (baseAddress) disconnect();
        else settleWagmi();
      }, 4_000);
    } else if (isConnected && address) {
      adopt({ address, chainId: chainId ?? null });
    }
    return () => {
      if (disconnectTimer.current != null) {
        window.clearTimeout(disconnectTimer.current);
        disconnectTimer.current = null;
      }
    };
  }, [status, isConnected, address, chainId, baseAddress, adopt, disconnect, settleWagmi]);

  // 1b. A wallet provider that never answers must not freeze the UI in
  // "Connecting…" forever — especially after disconnect + new dApp tab.
  useEffect(() => {
    if (status !== "reconnecting" && status !== "connecting") return;
    const timer = window.setTimeout(() => settleWagmi(), 5_000);
    return () => window.clearTimeout(timer);
  }, [status, settleWagmi]);

  // First paint: if wagmi is already idle-disconnected, stop restoring immediately.
  useEffect(() => {
    if (status === "disconnected") settleWagmi();
  }, [status, settleWagmi]);

  // 2. Attach the wallet provider (needed to send transactions) and run the one-time sign-in.
  useEffect(() => {
    // Do NOT clear SIWE attempts on disconnect flaps — that caused verify to fire again
    // every time wagmi briefly reported disconnected then reconnected.
    if (status === "disconnected") {
      siweDone.current = null;
      return;
    }

    if (!isConnected || !address || !connector) return;
    const key = address.toLowerCase();
    if (bridging.current === key) return;
    if (pending.has(key)) return;

    bridging.current = key;
    void (async () => {
      try {
        const provider = (await withTimeout(connector.getProvider(), 8000)) as
          | WalletProvider
          | undefined;
        if (!provider?.request) {
          // Provider still warming up — leave attempt unmarked so a later tick can attach it,
          // but do not open SIWE until the provider is real.
          return;
        }

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
          alreadyAttempted: hasSiweAttempt(key),
        });

        // Restored connection: read-only. No signature request, no redirect.
        if (decision === "skip") {
          siweDone.current = key;
          return;
        }

        if (decision === "sign") {
          const inFlight = pending.get(key);
          if (inFlight) await inFlight;
          else {
            // Mark before the wallet popup so a remount cannot open a second prompt.
            markSiweAttempt(key);
            siweDone.current = key;
            const login = signInWithEthereumWallet(provider, address, chainId ?? null)
              .then(() => undefined)
              .catch((cause: unknown) => {
                // A failed sign-in must be visible once; header shows a single retry CTA.
                showWalletNotice(
                  cause instanceof Error && cause.message
                    ? cause.message
                    : "Verification was not completed. Open Portfolio to retry once.",
                );
                throw cause;
              });
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
