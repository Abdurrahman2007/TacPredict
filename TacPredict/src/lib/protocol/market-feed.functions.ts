import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import {
  nativeMarketSchema,
  deploymentSchema,
  atomicDecimal,
  marketStatus,
  type NativeMarket,
  type ProtocolDeployment,
} from "./types";
import type { Market } from "@/domain/markets/types";
import { usdcShort } from "./display.mjs";
export type NativeFeed = {
  markets: Market[];
  cryptoUpDown: Partial<Record<"bitcoin" | "ethereum" | "solana" | "bnb", Market>>;
  source: "TacPredict";
  updatedAt: string;
  deployments: ProtocolDeployment[];
  error?: string;
  virtualMode?: boolean;
  virtualDeployment?: import("@/lib/virtual/types").VirtualDeployment;
};
const resultSchema = z.object({
  markets: z.array(nativeMarketSchema),
  deployments: z.array(deploymentSchema),
});
let cached: { value: NativeFeed; expires: number } | undefined;
export function toMarket(m: NativeMarket): Market {
  const price = (a: string) => Number(atomicDecimal(a));
  return {
    id: m.marketId,
    title: m.title,
    category: m.category,
    description: m.description,
    source: "TacPredict",
    sourceUrl: m.sourceUrl,
    resolutionCriteria: m.rules,
    createdAt: m.createdAt,
    startsAt: m.openAt,
    endsAt: m.closeAt,
    closesAt: new Date(m.closeAt).toISOString().slice(0, 16).replace("T", " ") + " UTC",
    volume: usdcShort(m.volumeAtomic),
    volume24h: price(m.volume24hAtomic),
    participants: m.traders,
    ...(m.liquidityAtomic === null ? {} : { liquidity: price(m.liquidityAtomic) }),
    ...(m.image ? { image: m.image } : {}),
    outcomes: m.outcomes.map((o) => ({
      id: String(o.index),
      label: o.label,
      probability: o.priceAtomic === null ? 0 : Number(o.priceAtomic) / 10000,
      probabilityKnown: o.priceAtomic !== null,
    })),
    native: { ...m, status: marketStatus(m) },
  };
}
export const getNativeMarketFeed = createServerFn({ method: "GET" }).handler(
  async (): Promise<NativeFeed> => {
    if (cached && cached.expires > Date.now() && !process.env["VIRTUAL_TRADING_CONFIG"])
      return cached.value;
    const updatedAt = new Date().toISOString();
    try {
      const { readVirtualCatalogue } = await import("@/lib/virtual/read.server");
      const virtual = await readVirtualCatalogue();
      if (virtual)
        return {
          markets: virtual.markets,
          cryptoUpDown: {},
          deployments: [],
          source: "TacPredict",
          updatedAt,
          virtualMode: true,
          virtualDeployment: virtual.deployment,
        };
      const { readProtocolRpc } = await import("./read.server");
      const data = resultSchema.parse(
        await readProtocolRpc("get_protocol_market_feed", { _limit: "150" }),
      );
      const markets = data.markets.map(toMarket);
      const cryptoUpDown: NativeFeed["cryptoUpDown"] = {};
      for (const [key, re] of [
        ["bitcoin", /\b(bitcoin|btc)\b/i],
        ["ethereum", /\b(ethereum|eth)\b/i],
        ["solana", /\b(solana|sol)\b/i],
        ["bnb", /\bbnb\b/i],
      ] as const) {
        const m = markets.find(
          (m) =>
            m.category === "Crypto" &&
            re.test(m.title) &&
            /up or down/i.test(m.title) &&
            m.native?.status === "OPEN",
        );
        if (m) cryptoUpDown[key] = m;
      }
      const value: NativeFeed = {
        markets,
        cryptoUpDown,
        source: "TacPredict",
        updatedAt,
        deployments: data.deployments,
      };
      cached = { value, expires: Date.now() + 20000 };
      return value;
    } catch {
      return {
        markets: [],
        cryptoUpDown: {},
        source: "TacPredict",
        updatedAt,
        deployments: [],
        virtualMode: Boolean(process.env["VIRTUAL_TRADING_CONFIG"]),
        error: process.env["VIRTUAL_TRADING_CONFIG"]
          ? "Virtual markets unavailable. No real-USDC fallback is permitted."
          : "Native markets are not available yet. No external odds or demo balances are substituted.",
      };
    }
  },
);
export const nativeMarketFeedQueryOptions = queryOptions({
  queryKey: ["native-market-feed", "v1"],
  queryFn: () => getNativeMarketFeed(),
  staleTime: 20000,
  refetchInterval: 30000,
  retry: 0,
  refetchOnWindowFocus: false,
});
