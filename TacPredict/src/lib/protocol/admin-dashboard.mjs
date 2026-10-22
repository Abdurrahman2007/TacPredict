/** Exact display helpers. Missing observations never become zero. */
export function countFromDetail(detail) {
  return typeof detail === "string" ? (/^(\d+)\b/.exec(detail)?.[1] ?? null) : null;
}
export function adminMoney(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return "Unavailable";
  const n = BigInt(value);
  if (n > 0n && n < 10000n) return "<0.01";
  return (
    (n / 1000000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    "." +
    ((n % 1000000n) / 10000n).toString().padStart(2, "0")
  );
}
export function marketType(category, subcategory) {
  return category === "Crypto"
    ? "Crypto"
    : category === "Sports"
      ? subcategory === "Football" || subcategory === "Cricket"
        ? subcategory
        : "Sports"
      : category || "Unknown";
}
export function aggregateExecutions(rows) {
  let volume = 0n;
  const participants = new Set();
  for (const r of rows) {
    const amount =
      typeof r.usdc_atomic === "number" && Number.isSafeInteger(r.usdc_atomic) && r.usdc_atomic >= 0
        ? String(r.usdc_atomic)
        : r.usdc_atomic;
    if (typeof amount !== "string" || !/^\d+$/.test(amount))
      throw Error("Exact volume unavailable");
    if (!/^0x[0-9a-f]{40}$/i.test(r.buyer) || !/^0x[0-9a-f]{40}$/i.test(r.seller))
      throw Error("Participants unavailable");
    volume += BigInt(amount);
    participants.add(r.buyer.toLowerCase());
    participants.add(r.seller.toLowerCase());
  }
  return { volumeAtomic: String(volume), participants: participants.size };
}
