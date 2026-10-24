import { createPublicClient, defineChain, getAddress, http, keccak256, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";
import { z } from "zod";
import type { VirtualDeployment } from "./types";
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const metadataSchema = z
  .object({
    id: z.string().regex(/^[1-9]\d*$/),
    title: z.string().min(3).max(200),
    category: z.enum(["Crypto", "Sports"]),
    description: z.string().min(1).max(12000),
    outcomes: z.array(z.string().min(1).max(80)).min(2).max(3),
    source: z.string().min(1).max(200),
    sourceUrl: z.string().url().startsWith("https://"),
    rules: z.string().min(1).max(12000),
  })
  .strict();
const schema = z
  .object({
    chainId: z.union([z.literal(8453), z.literal(84532), z.literal(31337)]),
    engine: address,
    codeHash: hash,
    startBlock: z.string().regex(/^\d+$/),
    enabled: z.boolean(),
    markets: z.array(metadataSchema).max(200),
  })
  .strict();
const forbidden = new Set([
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "0x8acc19eb2f3dcceda99af89ccc30416d17f02cd0a",
  "0xe01c23aac6f152a2ea437a7e6eb0a664a1908568",
  "0x00adb2c69b58f66ab64ddb0da01b7c72a3e8f2a7",
  "0x7e5e40bae779ebabb2295ef6d009ab95b0307f85",
  "0xf50797c34b214c81b80a9bd3e590c3ca0df8118f",
  "0x9b272c68f3338655a440b44dbc9cccb993d7650b3",
]);
export function virtualConfig() {
  const raw = process.env["VIRTUAL_TRADING_CONFIG"];
  if (!raw) return null;
  const parsed = schema.parse(JSON.parse(raw));
  if (
    forbidden.has(parsed.engine.toLowerCase()) ||
    /^0x0{40}$/i.test(parsed.engine) ||
    (parsed.chainId === 31337 && process.env["NODE_ENV"] !== "test")
  )
    throw Error("Invalid virtual-only deployment");
  if (new Set(parsed.markets.map((m) => m.id)).size !== parsed.markets.length)
    throw Error("Duplicate virtual market ID");
  const engine = getAddress(parsed.engine);
  const deployment: VirtualDeployment = {
    id: `${parsed.chainId}:${engine.toLowerCase()}:${parsed.codeHash.toLowerCase()}`,
    engine,
    chainId: parsed.chainId,
    codeHash: parsed.codeHash as Hex,
    startBlock: parsed.startBlock,
    enabled: parsed.enabled,
  };
  return { deployment, markets: parsed.markets };
}
export async function virtualRuntime() {
  const config = virtualConfig();
  if (!config) throw Error("Virtual trading is not configured");
  const url = process.env["VIRTUAL_RPC_URL"];
  if (!url) throw Error("Virtual RPC unavailable");
  const chain =
    config.deployment.chainId === 8453
      ? base
      : config.deployment.chainId === 84532
        ? baseSepolia
        : defineChain({
            id: 31337,
            name: "Local test",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: { default: { http: [url] } },
          });
  const client = createPublicClient({
    chain,
    transport: http(url, { timeout: 15000, retryCount: 1 }),
  });
  if ((await client.getChainId()) !== config.deployment.chainId)
    throw Error("Virtual chain mismatch");
  const code = await client.getBytecode({ address: config.deployment.engine });
  if (!code || keccak256(code).toLowerCase() !== config.deployment.codeHash.toLowerCase())
    throw Error("Virtual runtime bytecode mismatch");
  return { ...config, client };
}
