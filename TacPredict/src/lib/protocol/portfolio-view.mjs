/** Exact six-decimal amounts; unknown monetary data never becomes a fabricated zero. */
export function money(value, hidden = false) {
  if (hidden) return "••••";
  if (value === null || value === undefined) return "Unavailable";
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

export function selectedWalletSummary(positions, address, verifiedWallets, ready) {
  const wallet = String(address ?? "").toLowerCase();
  const verified = Boolean(
    ready &&
    /^0x[0-9a-f]{40}$/.test(wallet) &&
    verifiedWallets.some((a) => a.toLowerCase() === wallet),
  );
  const selected = verified
    ? positions.filter((p) => p.chainId === 8453 && p.wallet.toLowerCase() === wallet)
    : [];
  const valued = verified && selected.every((p) => p.valueAtomic !== null);
  return {
    verified,
    positions: selected,
    markedAtomic: valued ? selected.reduce((sum, p) => sum + BigInt(p.valueAtomic), 0n) : null,
    claimableAtomic: verified
      ? selected.reduce((sum, p) => sum + BigInt(p.claimableAtomic), 0n)
      : null,
  };
}
export function filterPortfolioPositions(
  items,
  markets,
  category = "All",
  state = "All",
  since = "",
) {
  const byId = new Map(markets.map((m) => [m.marketId, m]));
  const cutoff = since ? Date.parse(since + "T00:00:00Z") : null;
  return items.filter((p) => {
    const market = byId.get(p.marketId);
    const group = String(market?.subcategory ?? "").toLowerCase();
    const categoryMatch =
      category === "All" ||
      (category === "Crypto" ? market?.category === "Crypto" : group === category.toLowerCase());
    const closed = ["RESOLVED", "VOID", "SETTLED", "CANCELLED"].includes(p.status);
    const stateMatch = state === "All" || (state === "Closed" ? closed : !closed);
    // Updated date is not a trade date: the filter is labelled accordingly in the UI.
    const updated = Date.parse(p.updatedAt);
    return (
      categoryMatch &&
      stateMatch &&
      (cutoff === null || (Number.isFinite(updated) && updated >= cutoff))
    );
  });
}
