import { useEffect, useRef } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { PRIMARY_CHAIN_ID } from "@/lib/web3/constants";

/**
 * Strict Base-only: ask to switch when connected on any other chain.
 * One request per address/chain pair so a declined or failed switch can never
 * reopen the wallet in a loop.
 */
export function useEnsureBaseChain() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const requested = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address || !chainId) {
      requested.current = null;
      return;
    }
    if (chainId === PRIMARY_CHAIN_ID) {
      requested.current = null;
      return;
    }
    const key = `${address.toLowerCase()}:${chainId}`;
    if (requested.current === key) return;
    if (!switchChain || isPending) return;
    requested.current = key;
    switchChain({ chainId: PRIMARY_CHAIN_ID });
  }, [address, isConnected, chainId, switchChain, isPending]);
}
