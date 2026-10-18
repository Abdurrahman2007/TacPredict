import { memo } from "react";
import { PredictionMarketCard } from "./prediction-market-card";
import type { Market } from "@/domain/markets/types";
export const MarketCard = memo(function MarketCard({ market }: { market: Market }) {
  return <PredictionMarketCard market={market} />;
});
