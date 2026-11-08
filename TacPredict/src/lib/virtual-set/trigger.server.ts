/** Bearer-secret check for the keeper endpoint. The secret (VSET_KEEPER_TRIGGER_SECRET) is only a trigger password: it moves no funds. */
export async function authenticateKeeperTrigger(request: Request): Promise<Response | null> {
  const secret = process.env["VSET_KEEPER_TRIGGER_SECRET"];
  if (!secret || secret.length < 16) return new Response("Server configuration error", { status: 500 });
  const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });
  const digest = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(token), digest(secret)]);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0 ? null : new Response("Unauthorized", { status: 401 });
}
