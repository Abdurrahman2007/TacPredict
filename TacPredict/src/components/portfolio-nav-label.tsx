import { usePaperLedger } from "@/lib/paper/ledger";

/** Bottom-nav Portfolio label — shows available Virtual USDC (starts at $0). */
export function PortfolioNavLabel() {
  const { balance } = usePaperLedger();
  const n = Number.isFinite(balance) ? balance : 0;
  if (n <= 0) return <span className="text-[#6dce95]">$0</span>;
  if (n >= 1000) return <span className="text-[#6dce95]">${(n / 1000).toFixed(1)}k</span>;
  return <span className="text-[#6dce95]">${n.toFixed(0)}</span>;
}
