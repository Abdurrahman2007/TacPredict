import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { syncConnectedWallet } from "@/lib/web3/sync-wallet";
import { PRIMARY_CHAIN_ID } from "@/lib/web3/constants";

/**
 * On wallet connect: upsert address + chainId + timestamp to Supabase.
 * On disconnect: clear local sync refs + cached on-chain reads.
 */
export function useWalletSync() {
  const { address, chainId, isConnected, status } = useAccount();
  const queryClient = useQueryClient();
  const lastSynced = useRef<string | null>(null);
  const syncing = useRef(false);

  useEffect(() => {
    if (!isConnected || !address || status !== "connected") {
      lastSynced.current = null;
      return;
    }

    const key = `${address.toLowerCase()}:${chainId ?? PRIMARY_CHAIN_ID}`;
    if (lastSynced.current === key || syncing.current) return;

    syncing.current = true;
    void syncConnectedWallet({
      address,
      chainId: chainId ?? PRIMARY_CHAIN_ID,
    })
      .then((result) => {
        if (result.ok) lastSynced.current = key;
      })
      .finally(() => {
        syncing.current = false;
      });
  }, [address, chainId, isConnected, status]);

  useEffect(() => {
    if (status !== "disconnected") return;
    lastSynced.current = null;
    syncing.current = false;
    void queryClient.removeQueries({ queryKey: ["balance"] });
    void queryClient.removeQueries({ queryKey: ["readContract"] });
  }, [status, queryClient]);
}
