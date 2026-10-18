import type { Market } from "@/domain/markets/types";
import { PredictionMarketCard } from "./prediction-market-card";
export function HomeMarketCard({
  market,
  featured = false,
}: {
  market: Market;
  featured?: boolean;
}) {
  return <PredictionMarketCard market={market} featured={featured} />;
}
