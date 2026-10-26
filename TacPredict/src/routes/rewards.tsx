import { createFileRoute } from "@tanstack/react-router";
import { Gift, LockKeyhole } from "lucide-react";
export const Route = createFileRoute("/rewards")({
  head: () => ({ meta: [{ title: "Rewards — TacPredict" }] }),
  component: RewardsPage,
});
/** Retired legacy deposit tasks. Campaign publication requires a separate approval. */
function RewardsPage() {
  return (
    <div className="mx-auto max-w-3xl animate-enter" data-testid="rewards-page">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Rewards</h1>
        <span className="finance-badge">Virtual USDC</span>
      </div>
      <section className="mt-6 finance-card finance-reward-hero">
        <div className="flex items-center justify-between">
          <span className="finance-icon">
            <Gift size={23} />
          </span>
          <span className="finance-badge">
            <LockKeyhole size={12} />
            Inactive
          </span>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">No campaign is active.</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Future Virtual USDC campaigns require published eligibility and limits. No deposit,
          withdrawal, reward amount or TAC token is promised.
        </p>
      </section>
    </div>
  );
}
