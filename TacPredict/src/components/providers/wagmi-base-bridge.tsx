import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import type { WalletProvider } from "@/lib/onchain/wallet";
import { signInWithEthereumWallet } from "@/lib/onchain/wallet-auth";
import { supabase } from "@/integrations/supabase/client";
import { PRIMARY_CHAIN_ID } from "@/lib/web3/constants";

/**
 * Keeps legacy BaseWalletProvider in sync with RainbowKit/Wagmi,
 * then SIWE into Supabase once per address (no email/social).
 */
export function WagmiBaseBridge() {
  const { address, isConnected, connector, chainId, status } = useAccount();
  const {
    address: baseAddress,
    connect,
    disconnect,
    switchToBase,
  } = useBaseWallet();
  const siweDone = useRef<string | null>(null);
  const bridging = useRef(false);

  useEffect(() => {
    if (status === "disconnected") {
      siweDone.current = null;
      if (baseAddress) disconnect();
      return;
    }

    if (!isConnected || !address || !connector || bridging.current) return;

    bridging.current = true;
    void (async () => {
      try {
        if (chainId && chainId !== PRIMARY_CHAIN_ID) {
          await switchToBase();
        }

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
        const sessionUser = data.session?.user;
        const identities =
          sessionUser?.identities?.flatMap((i) => [
            i.identity_data?.["address"],
            i.identity_data?.["sub"],
          ]) ?? [];
        const alreadyWallet =
          typeof identities.find(
            (v) => typeof v === "string" && v.toLowerCase() === key,
          ) === "string";

        if (!alreadyWallet) {
          await signInWithEthereumWallet(provider);
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
  }, [
    address,
    baseAddress,
    isConnected,
    connector,
    chainId,
    status,
    connect,
    disconnect,
    switchToBase,
  ]);

  return null;
}
