import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAccount } from "wagmi";

/** Connecting a wallet must not create an account binding or write financial records. */
export function useWalletSync() {
  const { status } = useAccount();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (status !== "disconnected") return;
    void queryClient.removeQueries({ queryKey: ["balance"] });
    void queryClient.removeQueries({ queryKey: ["readContract"] });
  }, [status, queryClient]);
}
