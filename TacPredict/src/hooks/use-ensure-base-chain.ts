import { useEffect } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { PRIMARY_CHAIN_ID } from "@/lib/web3/constants";

/** Strict Base-only: switch when connected on any other chain. */
export function useEnsureBaseChain() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  useEffect(() => {
    if (!isConnected || !chainId || chainId === PRIMARY_CHAIN_ID) return;
    if (!switchChain || isPending) return;
    switchChain({ chainId: PRIMARY_CHAIN_ID });
  }, [isConnected, chainId, switchChain, isPending]);
}
