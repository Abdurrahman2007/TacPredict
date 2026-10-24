const safeMessages = new Set([
  "Virtual chain data is stale; trading blocked until the provider recovers.",
  "Virtual trading is not configured",
  "Virtual trading disabled",
  "Invalid virtual-only deployment",
  "Duplicate virtual market ID",
  "Virtual RPC unavailable",
  "Virtual chain mismatch",
  "Virtual runtime bytecode mismatch",
  "Unknown virtual market/outcome",
  "Invalid quantity",
  "Insufficient virtual balance/shares or position limit",
  "Waiting for verified virtual indexing before another trade",
  "Virtual indexer is stale; trading blocked until reconciliation.",
  "Market source policy not verified; trading blocked",
  "Explicit data-source freshness policy required",
  "Invalid crypto resolution policy",
  "Invalid sports resolution policy",
  "Virtual projection unavailable",
  "Virtual indexer has not reached deployment",
  "Virtual projection reorged; indexer reconciliation required",
  "Virtual history reorged; retry after reconciliation",
  "Virtual immutable metadata mismatch",
  "Missing indexed virtual market creation",
  "Virtual balance reconciliation failed",
  "Virtual position reconciliation failed",
  "Virtual PnL reconciliation failed",
  "Verify wallet ownership first",
  "Verified wallet ownership required",
  "Administrator MFA required",
  "Administrator required",
  "Audit trail unavailable; indexer not advanced",
  "Indexer ran; completion audit needs reconciliation",
  "Transaction observation storage unavailable; trade state must be reconciled",
  "Prior transaction evidence unavailable",
]);
// Provider errors may contain credential-bearing RPC URLs or Supabase details.
// Only deliberately enumerated user messages may cross the server-function boundary.
export async function publicVirtualBoundary<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw Error(
      e instanceof Error && safeMessages.has(e.message)
        ? e.message
        : "Virtual service unavailable. Check network/gas and retry; no unverified trade was credited.",
    );
  }
}
