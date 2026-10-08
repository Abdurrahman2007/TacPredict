import { useQuery } from "@tanstack/react-query";
import { authFeatures } from "@/lib/auth-config";
import { getAuthProviderStatus } from "@/lib/auth-provider-status.functions";
export function useAuthFeatures() {
  const { data } = useQuery({
    queryKey: ["auth-provider-settings-v2"],
    queryFn: () => getAuthProviderStatus(),
    staleTime: 60_000,
    gcTime: 600_000,
    retry: 1,
  });
  return data ?? { ...authFeatures, xProvider: "x" as const };
}
