/** Chain and CoinGecko access for the keeper: viem, one reporter key, nothing else. */
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { COINGECKO_IDS } from "./pool.mjs";
import { runKeeper } from "./keeper-core.mjs";

const abi = parseAbi([
  "function getWindow(uint8 asset,uint32 duration,uint64 start) view returns ((uint128 upPool,uint128 downPool,uint128 startPrice,uint128 endPrice,uint128 fee,uint128 distributable,uint128 claimedWin,uint128 paidBonus,uint64 startObservedAt,uint64 endObservedAt,uint64 claimOpensAt,uint16 feeBps,uint8 state,uint8 result,bool feeBooked))",
  "function reportStarts((uint8 asset,uint32 duration,uint64 start,uint128 price,uint64 observedAt)[] items)",
  "function reportEnds((uint8 asset,uint32 duration,uint64 start,uint128 price,uint64 observedAt)[] items)",
]);
const chain = {
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
};

/** The environment names a Worker (or any host) must provide. The key is never logged. */
export function keeperEnv(env) {
  const key = String(env.POOL_REPORTER_PRIVATE_KEY ?? "").trim();
  const pool = String(env.UPDOWN_POOL_ADDRESS ?? "").trim();
  const rpc = String(env.BASE_PROTOCOL_RPC_URL ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return { error: "POOL_REPORTER_PRIVATE_KEY is not set" };
  if (!/^0x[0-9a-fA-F]{40}$/.test(pool)) return { error: "UPDOWN_POOL_ADDRESS is not set" };
  if (!rpc) return { error: "BASE_PROTOCOL_RPC_URL is not set" };
  return { key, pool, rpc, geckoKey: String(env.COINGECKO_DEMO_API_KEY ?? "").trim() };
}

export async function runPoolKeeper(env, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), nowMs = () => Date.now(), log = () => {} } = {}) {
  const config = keeperEnv(env);
  if (config.error) return { status: "NOT_CONFIGURED", reason: config.error };
  const account = privateKeyToAccount(config.key);
  const transport = http(config.rpc, { timeout: 8000, retryCount: 1 });
  const pub = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ chain, account, transport });
  return runKeeper({
    nowMs,
    sleep,
    log,
    readWindows: (jobs) =>
      pub.multicall({
        allowFailure: false,
        contracts: jobs.map((job) => ({
          address: config.pool,
          abi,
          functionName: "getWindow",
          args: [job.asset === "bitcoin" ? 0 : job.asset === "ethereum" ? 1 : job.asset === "solana" ? 2 : 3, job.duration, BigInt(job.start)],
        })),
      }),
    fetchPrices: async (assets) => {
      const ids = assets.map((asset) => COINGECKO_IDS[asset]).join(",");
      const response = await fetchImpl(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_last_updated_at=true&precision=full`,
        {
          headers: { accept: "application/json", ...(config.geckoKey ? { "x-cg-demo-api-key": config.geckoKey } : {}) },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) throw Error(`CoinGecko returned ${response.status}`);
      return response.json();
    },
    sendReports: async ({ ends, starts }) => {
      const hashes = [];
      let nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
      for (const [name, items] of [["reportEnds", ends], ["reportStarts", starts]]) {
        if (!items.length) continue;
        hashes.push(await wallet.writeContract({ address: config.pool, abi, functionName: name, args: [items], nonce }));
        nonce += 1;
      }
      for (const hash of hashes) await pub.waitForTransactionReceipt({ hash, timeout: 60000 });
      return hashes;
    },
  });
}
