import { PageHeader, Unavailable } from "../admin-ui";

const COPY: Record<string, { title: string; subtitle: string; unavailable: string; needs: string }> = {
  usdc: {
    title: "USDC",
    subtitle: "Protocol collateral held on Base.",
    unavailable: "USDC treasury administration is not enabled",
    needs: "A reviewed treasury design and read functions for contract-held USDC.",
  },
  fees: {
    title: "Fees",
    subtitle: "Protocol fee accounting.",
    unavailable: "Fee administration is not enabled",
    needs: "A deployed fee mechanism. The current Exchange has no configurable platform fee, so no fee revenue exists to report.",
  },
  withdrawals: {
    title: "Withdrawals",
    subtitle: "Treasury and user withdrawals.",
    unavailable: "Withdrawal administration is not enabled",
    needs: "An audited transfer workflow with role separation and approvals.",
  },
};

export function TreasuryView({ view }: { view: string }) {
  const copy = COPY[view] ?? COPY["usdc"]!;
  return (
    <div className="adm-stack">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      <Unavailable title={copy.unavailable} needs={copy.needs}>
        No balances, claimable amounts or fee totals are shown because none are read. Nothing has
        been inferred, and this panel cannot move funds or edit any balance.
      </Unavailable>
    </div>
  );
}
