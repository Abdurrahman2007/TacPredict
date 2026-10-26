import type { Market } from "@/domain/markets/types";
import { VirtualAmountCard } from "./virtual/virtual-amount-card";
export function PredictionAmountCard(props: {
  market: Market;
  selected?: string | undefined;
  onSelect: (id: string) => void;
}) {
  return props.market.virtual ? (
    <VirtualAmountCard {...props} />
  ) : (
    <section className="pd-order" aria-label="Virtual trading unavailable">
      <div className="pd-amount-panel">
        <p>Virtual USDC trading unavailable for this market.</p>
        <p className="pd-contracts">No real-USDC trading or funding is available.</p>
      </div>
    </section>
  );
}
