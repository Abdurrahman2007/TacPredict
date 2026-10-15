import { useQuery } from "@tanstack/react-query";
import { getProtocolAdminSnapshot, getProtocolLiveChainState } from "@/lib/protocol/admin.functions";
import type { AdminSection } from "@/lib/protocol/admin-view";

/** Role + AAL2 protected snapshot (finalized indexed data). Errors stay errors, never zeros. */
export function useAdminSnapshot(section: AdminSection) {
  return useQuery({
    queryKey: ["admin-snapshot", section],
    queryFn: () => getProtocolAdminSnapshot({ data: { section } }),
    retry: 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/** Live Base Mainnet observation. Manual refresh only, so it never burns RPC quota in the background. */
export function useLiveChain() {
  return useQuery({
    queryKey: ["admin-live-chain"],
    queryFn: () => getProtocolLiveChainState(),
    retry: 0,
    staleTime: 60_000,
  });
}
