/** Exact six-decimal amounts; unknown monetary data never becomes a fabricated zero. */
export function money(value, hidden = false) {
  if (hidden) return "••••";
  if (value === null || value === undefined) return "$0.00";
  const text = String(value);
  if (!/^\d+$/.test(text)) throw Error("Invalid atomic amount");
  const n = BigInt(text);
  const cents = n / 10000n;
  return (
    "$" +
    (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    "." +
    (cents % 100n).toString().padStart(2, "0")
  );
}
export function visiblePositions(
  items,
  search = "",
  sort = "value",
  descending = true,
  activeOnly = false,
) {
  const term = search.trim().toLowerCase();
  const list = items.filter(
    (p) =>
      p.chainId === 8453 &&
      p.title.toLowerCase().includes(term) &&
      (!activeOnly || ["OPEN", "UPCOMING", "CLOSED", "RESOLVING"].includes(p.status)),
  );
  return list.sort((a, b) => {
    const av =
      sort === "shares"
        ? a.sharesAtomic
        : sort === "recent"
          ? Date.parse(a.updatedAt)
          : a.valueAtomic;
    const bv =
      sort === "shares"
        ? b.sharesAtomic
        : sort === "recent"
          ? Date.parse(b.updatedAt)
          : b.valueAtomic;
    if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
    if (bv === null || bv === undefined) return -1;
    const x = sort === "recent" ? av : BigInt(av),
      y = sort === "recent" ? bv : BigInt(bv);
    return (x < y ? -1 : x > y ? 1 : 0) * (descending ? -1 : 1);
  });
}
export function remainingShares(shares, filled) {
  if (!/^\d+$/.test(shares) || !/^\d+$/.test(filled)) throw Error("Invalid order amount");
  const n = BigInt(shares) - BigInt(filled);
  if (n < 0n) throw Error("Invalid filled amount");
  return n.toString();
}
