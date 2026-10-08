import { useQuery } from "@tanstack/react-query";
import { authFeatures } from "@/lib/auth-config";
// Provider availability is public Supabase configuration, not a credential.
// Query caching lets dashboard changes reach the app without another deployment.
export function useAuthFeatures() {
  const { data } = useQuery({
    queryKey: ["auth-provider-settings"],
    queryFn: async () => {
      const url = import.meta.env["VITE_SUPABASE_URL"];
      const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
      if (!url || !key) throw new Error("Authentication configuration unavailable");
      const response = await fetch(`${url}/auth/v1/settings`, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Authentication settings unavailable");
      const settings = (await response.json()) as { external?: Record<string, boolean> };
      return {
        google: settings.external?.["google"] === true,
        x: settings.external?.["twitter"] === true,
        emailOtp: settings.external?.["email"] === true,
      };
    },
    staleTime: 60_000,
    gcTime: 600_000,
    retry: 1,
  });
  return data ?? authFeatures;
}
