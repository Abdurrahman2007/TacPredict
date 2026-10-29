import type { Market } from "@/domain/markets/types";
import { VirtualAmountCard } from "./virtual/virtual-amount-card";
import { PaperAmountCard } from "./paper/paper-amount-card";
export function PredictionAmountCard(props: {
  market: Market;
  selected?: string | undefined;
  onSelect: (id: string) => void;
  tradingAllowed?: boolean;
  settlementNote?: string;
}) {
  if (props.market.virtual)
    return (
      <VirtualAmountCard
        market={props.market}
        selected={props.selected}
        onSelect={props.onSelect}
        {...(props.tradingAllowed !== undefined ? { tradingAllowed: props.tradingAllowed } : {})}
        {...(props.settlementNote !== undefined ? { settlementNote: props.settlementNote } : {})}
      />
    );
  if (props.market.outcomes.some((o) => o.probabilityKnown !== false))
    return (
      <PaperAmountCard
        market={props.market}
        selected={props.selected}
        onSelect={props.onSelect}
        {...(props.tradingAllowed !== undefined ? { tradingAllowed: props.tradingAllowed } : {})}
        {...(props.settlementNote !== undefined ? { settlementNote: props.settlementNote } : {})}
      />
    );
  return (
    <section className="pd-order" aria-label="Virtual trading unavailable">
      <div className="pd-amount-panel">
        <p>Virtual USDC trading unavailable for this market.</p>
        <p className="pd-contracts">No real-USDC trading or funding is available.</p>
      </div>
    </section>
  );
}
