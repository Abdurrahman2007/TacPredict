import type { Market } from "@/domain/markets/types";
import { VirtualAmountCard } from "./virtual/virtual-amount-card";
import { PaperAmountCard } from "./paper/paper-amount-card";
export function PredictionAmountCard(props: {
  market: Market;
  selected?: string | undefined;
  onSelect: (id: string) => void;
}) {
  if (props.market.virtual) return <VirtualAmountCard {...props} />;
  if (props.market.outcomes.some((o) => o.probabilityKnown !== false))
    return <PaperAmountCard {...props} />;
  return (
    <section className="pd-order" aria-label="Virtual trading unavailable">
      <div className="pd-amount-panel">
        <p>Virtual USDC trading unavailable for this market.</p>
        <p className="pd-contracts">No real-USDC trading or funding is available.</p>
      </div>
    </section>
  );
}
