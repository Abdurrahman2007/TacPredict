import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { getVirtualAccount } from "./functions";
import type { VirtualDeployment } from "./types";
export function useVirtualAccount(deployment: VirtualDeployment | undefined) {
  const w = useBaseWallet(),
    auth = useProtocolUser();
  return useQuery({
    queryKey: ["virtual", deployment?.id, "account", auth.user?.id, w.address?.toLowerCase()],
    enabled: Boolean(deployment && w.address && auth.user),
    queryFn: () => getVirtualAccount({ data: { wallet: w.address as Address } }),
    staleTime: 3000,
    refetchInterval: 5000,
    retry: 0,
  });
}
export const virtualMoney = (s: string | undefined) =>
  s === undefined
    ? "—"
    : (Number(s) / 1e6).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
