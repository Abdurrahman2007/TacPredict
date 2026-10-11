const date = (value) => {
  const n = Date.parse(value ?? "");
  return Number.isFinite(n) ? n : null;
};
/** Metadata without its own traded volume must never get a synthetic activity rank. */
export function sortListings(items, sort = "Trending") {
  return [...items].sort((a, b) => {
    if (sort === "Ending soon") {
      const x = date(a.endsAt ?? a.closeAt),
        y = date(b.endsAt ?? b.closeAt);
      return (x ?? Number.MAX_SAFE_INTEGER) - (y ?? Number.MAX_SAFE_INTEGER);
    }
    if (sort === "New")
      return (
        (date(b.createdAt ?? b.updatedAt ?? b.observedAt) ?? 0) -
        (date(a.createdAt ?? a.updatedAt ?? a.observedAt) ?? 0)
      );
    const x = a.native?.volume24hAtomic,
      y = b.native?.volume24hAtomic;
    if (x !== undefined && y !== undefined) {
      const bx = BigInt(x),
        by = BigInt(y);
      if (bx !== by) return bx > by ? -1 : 1;
    }
    if (sort === "Most active") return (b.participants ?? 0) - (a.participants ?? 0);
    return 0;
  });
}
