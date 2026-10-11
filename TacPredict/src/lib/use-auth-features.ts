import { useQuery } from "@tanstack/react-query";
import { getAuthProviderStatus } from "@/lib/auth-provider-status.functions";
export function useAuthFeatures() {
  const { data, isPending } = useQuery({
    queryKey: ["auth-provider-settings-v2"],
    queryFn: () => getAuthProviderStatus(),
    staleTime: 60_000,
    gcTime: 600_000,
    retry: 1,
  });
  return {
    ...(data ?? { google: false, x: false, emailOtp: false, xProvider: "x" as const }),
    loading: isPending,
  };
}
