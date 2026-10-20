/** Environment names the price keeper needs. Kept apart from viem so it is cheap to test. */
export function keeperEnv(env) {
  const key = String(env.POOL_REPORTER_PRIVATE_KEY ?? "").trim();
  const pool = String(env.UPDOWN_POOL_ADDRESS ?? "").trim();
  const rpc = String(env.BASE_PROTOCOL_RPC_URL ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return { error: "POOL_REPORTER_PRIVATE_KEY is not set" };
  if (!/^0x[0-9a-fA-F]{40}$/.test(pool)) return { error: "UPDOWN_POOL_ADDRESS is not set" };
  if (!rpc) return { error: "BASE_PROTOCOL_RPC_URL is not set" };
  return { key, pool, rpc, geckoKey: String(env.COINGECKO_DEMO_API_KEY ?? "").trim() };
}
