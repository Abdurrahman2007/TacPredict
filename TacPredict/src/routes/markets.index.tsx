import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { MarketCard } from "@/components/market-card";
import { categories } from "@/domain/markets/demo-markets";
import { useSuspenseQuery } from "@tanstack/react-query";
import { polymarketFeedQueryOptions } from "@/lib/polymarket.functions";
import { useMemo } from "react";

const sortOptions = ["Trending", "Most active", "Ending soon", "New"] as const;
type SortOption = (typeof sortOptions)[number];

export const Route = createFileRoute("/markets/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { category?: string; sort?: SortOption; q?: string } => ({
    ...(typeof search["category"] === "string" ? { category: search["category"] } : {}),
    ...(sortOptions.includes(search["sort"] as SortOption)
      ? { sort: search["sort"] as SortOption }
      : {}),
    ...(typeof search["q"] === "string" ? { q: search["q"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Markets — TacPredict" },
      {
        name: "description",
        content:
          "Explore active prediction markets across crypto, sports, technology, business, and culture.",
      },
      { property: "og:title", content: "Markets — TacPredict" },
      {
        property: "og:description",
        content:
          "Explore active prediction markets and explore outcomes in the Base USDC interface.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(polymarketFeedQueryOptions),
  errorComponent: ({ error }) => (
    <div role="alert" className="py-16 text-center">
      <h1 className="page-title">Markets unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Please try again."}
      </p>
    </div>
  ),
  notFoundComponent: () => <div className="py-16 text-center">No markets found.</div>,
  component: MarketsPage,
});

function MarketsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/markets/" });
  const category = search.category ?? "All";
  const sort = search.sort ?? "Trending";
  const query = search.q ?? "";
  const { data: liveFeed } = useSuspenseQuery(polymarketFeedQueryOptions);
  const filtered = useMemo(() => {
    const allMarkets = liveFeed.markets;
    return allMarkets
      .filter((market) => {
        const categoryMatches = category === "All" || market.category === category;
        const queryMatches = market.title.toLowerCase().includes(query.toLowerCase());
        return categoryMatches && queryMatches;
      })
      .sort((a, b) => {
        if (sort === "Most active")
          return (b.volume24h ?? b.participants) - (a.volume24h ?? a.participants);
        if (sort === "Ending soon")
          return (
            (Date.parse(a.endsAt ?? "") || Number.MAX_SAFE_INTEGER) -
            (Date.parse(b.endsAt ?? "") || Number.MAX_SAFE_INTEGER)
          );
        if (sort === "New")
          return (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0);
        return (b.volume24h ?? 0) - (a.volume24h ?? 0);
      });
  }, [category, liveFeed.markets, query, sort]);

  return (
    <div className="animate-enter">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <h1 className="page-title truncate">Markets</h1>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-positive">
          <span className="size-1.5 rounded-full bg-positive motion-safe:animate-pulse" />
          {filtered.length} live
        </span>
      </div>

      <label className="mt-4 flex h-11 items-center gap-2 rounded-full border border-input bg-card px-4 transition-shadow focus-within:ring-2 focus-within:ring-ring/30">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) =>
            navigate({
              search: (previous) => ({ ...previous, q: event.target.value }),
              replace: true,
            })
          }
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Search markets"
          aria-label="Search markets"
        />
      </label>

      <div className="scrollbar-none -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {categories.map((category) => (
          <Link
            key={category}
            to="/markets"
            search={(previous) => ({ ...previous, category })}
            className={
              search.category === category || (category === "All" && !search.category)
                ? "filter-chip-active"
                : "filter-chip"
            }
          >
            {category}
          </Link>
        ))}
      </div>

      <div className="scrollbar-none -mx-4 mt-3 flex gap-5 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {sortOptions.map((sort) => (
          <Link
            key={sort}
            to="/markets"
            search={(previous) => ({ ...previous, sort })}
            className={
              search.sort === sort || (sort === "Trending" && !search.sort)
                ? "market-tab-active"
                : "market-tab"
            }
          >
            {sort}
          </Link>
        ))}
      </div>

      {liveFeed.error && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
        >
          {liveFeed.error}
          {liveFeed.markets.length === 0 && " Try refreshing in a moment."}
        </p>
      )}
      {filtered.length > 0 ? (
        <div className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-3">
          {filtered.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <p className="font-bold">No matching markets</p>
          <p className="mt-1 text-sm text-muted-foreground">Try another search or category.</p>
        </div>
      )}
      <p className="mt-5 text-center text-[0.65rem] font-semibold text-muted-foreground">
        Odds and volume from Polymarket · Base execution contracts not connected
      </p>
    </div>
  );
}
