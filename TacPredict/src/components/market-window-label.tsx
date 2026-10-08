import { useEffect, useState } from "react";
import type { Market } from "@/domain/markets/types";
import { marketLocalWindowLabel } from "@/lib/market-timing";
export function MarketWindowLabel({
  market,
  className = "",
}: {
  market: Market;
  className?: string;
}) {
  const [zone, setZone] = useState("UTC");
  useEffect(() => {
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);
  const label = marketLocalWindowLabel(market, zone);
  return label ? <p className={className}>{label}</p> : null;
}
