const PROJECT = "lmqaiqvwcytmgwgwyfwx";
export async function readProtocolRpc(name: string, params: Record<string, string> = {}) {
  const base = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!base || !key || new URL(base).hostname !== `${PROJECT}.supabase.co`)
    throw new Error("Main Supabase project is not configured.");
  const url = new URL(`/rest/v1/rpc/${name}`, base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = await fetch(url, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Native market database is temporarily unavailable.");
  return response.json() as Promise<unknown>;
}
