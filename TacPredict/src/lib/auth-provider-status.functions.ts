import { createServerFn } from "@tanstack/react-start";
let cache:
  | {
      expires: number;
      value: { google: boolean; emailOtp: boolean; x: boolean; xProvider: "x" | "twitter" };
    }
  | undefined;
export const getAuthProviderStatus = createServerFn({ method: "GET" }).handler(async () => {
  if (cache && cache.expires > Date.now()) return cache.value;
  const url = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Authentication settings unavailable");
  const headers = { apikey: key };
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Authentication settings unavailable");
  const settings = (await response.json()) as { external?: Record<string, boolean> };
  // Supabase's legacy public external list can omit the newer OAuth 2.0 `x` provider.
  // Check its real authorize route without following the redirect or creating a session.
  let modernX = settings.external?.["x"] === true;
  if (!modernX) {
    try {
      const check = await fetch(
        `${url}/auth/v1/authorize?provider=x&redirect_to=${encodeURIComponent("https://tacpredict.fun/auth/callback")}`,
        { headers, redirect: "manual", signal: AbortSignal.timeout(5000) },
      );
      const location = check.headers.get("location");
      modernX =
        check.status >= 300 &&
        check.status < 400 &&
        Boolean(location && /(^|\.)(x\.com|twitter\.com)$/.test(new URL(location).hostname));
    } catch {
      /* Never infer that a failing provider is ready. */
    }
  }
  const value = {
    google: settings.external?.["google"] === true,
    emailOtp: settings.external?.["email"] === true,
    x: modernX || settings.external?.["twitter"] === true,
    xProvider: modernX ? ("x" as const) : ("twitter" as const),
  };
  cache = { value, expires: Date.now() + 60_000 };
  return value;
});
