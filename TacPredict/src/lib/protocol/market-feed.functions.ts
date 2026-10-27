import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { atomicDecimal, marketStatus, type NativeMarket, type ProtocolDeployment } from "./types";
import type { Market } from "@/domain/markets/types";
import { usdcShort } from "./display.mjs";
export type NativeFeed = {
  markets: Market[];
  cryptoUpDown: Partial<Record<"bitcoin" | "ethereum" | "solana" | "xrp" | "bnb", Market>>;
  source: "TacPredict";
  updatedAt: string;
  deployments: ProtocolDeployment[];
  error?: string;
  virtualMode?: boolean;
  virtualDeployment?: import("@/lib/virtual/types").VirtualDeployment;
};
/** Historical data conversion only; never a real-USDC execution fallback. */
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
    const updatedAt = new Date().toISOString();
    try {
      const { readVirtualCatalogue } = await import("@/lib/virtual/read.server");
      const { coalesceCatalogue } = await import("@/lib/virtual/catalogue-coalescer.server");
      const virtual = await coalesceCatalogue(
        [
          "virtual-catalogue-v1",
          process.env["VIRTUAL_TRADING_CONFIG"] ?? null,
          process.env["VIRTUAL_RPC_URL"] ?? null,
          process.env["SUPABASE_URL"] ?? null,
        ],
        () => readVirtualCatalogue(),
      );
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
      return {
        markets: [],
        cryptoUpDown: {},
        deployments: [],
        source: "TacPredict",
        updatedAt,
        virtualMode: true,
        error: "Virtual markets are not configured. Real-USDC trading is disabled.",
      };
    } catch {
      return {
        markets: [],
        cryptoUpDown: {},
        source: "TacPredict",
        updatedAt,
        deployments: [],
        virtualMode: true,
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
  staleTime: 3000,
  refetchInterval: 5000,
  retry: 0,
  refetchOnWindowFocus: false,
});
