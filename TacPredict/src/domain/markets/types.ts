export type MarketCategory =
  "Crypto" | "Sports" | "News" | "Technology" | "Business" | "Culture" | "Other";

export type MarketOutcome = {
  id: string;
  label: string;
  probability: number;
  probabilityKnown?: boolean;
};

export type Market = {
  virtual?: import("@/lib/virtual/types").VirtualMarketRef;
  native?: import("@/lib/protocol/types").NativeMarket;
  id: string;
  title: string;
  category: MarketCategory;
  closesAt: string;
  createdAt?: string;
  endsAt?: string;
  startsAt?: string;
  liquidity?: number;
  volume24h?: number;
  volume: string;
  participants: number;
  outcomes: MarketOutcome[];
  image?: string;
  featured?: boolean;
  trend?: "up" | "down" | "flat";
  description: string;
  source: string;
  sourceUrl: string;
  resolutionCriteria: string;
};
