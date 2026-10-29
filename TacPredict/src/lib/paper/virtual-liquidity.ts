/** Format paper volume for UI (real ledger totals only — no fake pools). */
export function formatLiq(n: number) {
  if (!(n > 0)) return "$0";
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
