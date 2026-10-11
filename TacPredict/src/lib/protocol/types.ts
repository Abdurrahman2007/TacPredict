import { z } from "zod";
const atomic = z.string().regex(/^\d+$/);
const hex = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const deploymentSchema = z.object({
  chainId: z.union([z.literal(8453), z.literal(84532)]),
  collateral: hex,
  registry: hex,
  factory: hex,
  positions: hex,
  exchange: hex,
  oracle: hex,
  settlement: hex,
  tradingEnabled: z.boolean(),
  codeHashes: z.object(
    Object.fromEntries(
      ["registry", "factory", "positions", "exchange", "oracle", "settlement"].map((k) => [
        k,
        z.string().regex(/^0x[0-9a-f]{64}$/),
      ]),
    ),
  ),
});
export const nativeMarketSchema = z.object({
  id: z.string().uuid(),
  marketId: z.string().regex(/^TACP-\d+-\d+$/),
  onchainId: atomic,
  chainId: z.union([z.literal(8453), z.literal(84532)]),
  questionId: z.string(),
  conditionId: z.string(),
  metadataHash: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.enum(["Crypto", "Sports", "News", "Technology", "Business", "Culture", "Other"]),
  subcategory: z.string().nullable(),
  image: z.string().nullable(),
  tags: z.array(z.string()),
  source: z.string(),
  sourceUrl: z.string(),
  rules: z.string(),
  oracle: hex,
  status: z.enum([
    "DRAFT",
    "UPCOMING",
    "OPEN",
    "CLOSED",
    "RESOLVING",
    "RESOLVED",
    "SETTLED",
    "VOID",
    "CANCELLED",
  ]),
  createdAt: z.string(),
  openAt: z.string(),
  closeAt: z.string(),
  resolveAfter: z.string(),
  resolutionDeadline: z.string(),
  openInterestAtomic: atomic,
  liquidityAtomic: atomic.nullable(),
  volumeAtomic: atomic,
  volume24hAtomic: atomic,
  traders: z.number(),
  outcomes: z.array(
    z.object({
      index: z.number().int(),
      label: z.string(),
      tokenId: atomic.nullable(),
      priceAtomic: atomic.nullable(),
      payoutWeight: atomic.nullable(),
    }),
  ),
});
export type NativeMarket = z.infer<typeof nativeMarketSchema>;
export type ProtocolDeployment = z.infer<typeof deploymentSchema>;
export function atomicDecimal(v: string, decimals = 6) {
  const n = BigInt(v);
  const unit = 10n ** BigInt(decimals);
  return `${n / unit}.${(n % unit).toString().padStart(decimals, "0")}`;
}
export function marketStatus(m: NativeMarket, now = Date.now()) {
  if (["DRAFT", "RESOLVING", "RESOLVED", "SETTLED", "VOID", "CANCELLED"].includes(m.status))
    return m.status;
  return now < Date.parse(m.openAt) ? "UPCOMING" : now < Date.parse(m.closeAt) ? "OPEN" : "CLOSED";
}
