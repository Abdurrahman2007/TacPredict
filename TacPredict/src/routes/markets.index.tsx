import { useQuery } from "@tanstack/react-query";
import { eventDraftsQueryOptions } from "@/lib/agent/events.functions";
import { DiscoveredEvents } from "@/components/discovered-events";
import { createFileRoute, Link } from "@tanstack/react-router";
import { sortListings } from "@/lib/markets/listing-sort.mjs";
import marketsCss from "@/styles/markets-compact.css?url";
import { MarketCard } from "@/components/market-card";
import { marketSection, sectionOf } from "@/domain/markets/sections.mjs";
import { useSuspenseQuery } from "@tanstack/react-query";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { useMemo } from "react";

import { MARKET_SORTS, SPORTS_FILTERS, isSportsListing } from "@/lib/markets/public-tabs.mjs";
const sortOptions = MARKET_SORTS;
type SortOption = (typeof sortOptions)[number];

export const Route = createFileRoute("/markets/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { category?: string; sort?: SortOption; q?: string } => ({
    ...(typeof search["category"] === "string" &&
    (SPORTS_FILTERS as readonly string[]).includes(search["category"])
      ? { category: search["category"] }
      : {}),
    ...(sortOptions.includes(search["sort"] as SortOption)
      ? { sort: search["sort"] as SortOption }
      : {}),
  }),
  head: () => ({
    links: [{ rel: "stylesheet", href: marketsCss }],
    meta: [
      { title: "Markets — TacPredict" },
      {
        name: "description",
        content: "Explore Football and Cricket prediction markets on Base with USDC.",
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
  loader: ({ context }) => context.queryClient.ensureQueryData(nativeMarketFeedQueryOptions),
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
  const category = search.category ?? "All";
  const sort = search.sort ?? "Trending";
  const query = "";
  const events = useQuery(eventDraftsQueryOptions);
  const otherMatches = (events.data ?? [])
    .filter(isSportsListing)
    .some(
      (p) =>
        (category === "All" ? sectionOf(p) !== null : sectionOf(p) === category) &&
        p.title.toLowerCase().includes(query.toLowerCase()),
    );
  const { data: liveFeed } = useSuspenseQuery(nativeMarketFeedQueryOptions);
  const filtered = useMemo(
    () =>
      sortListings(
        liveFeed.markets.filter(
          (market) =>
            isSportsListing(market) && (category === "All" || marketSection(market) === category),
        ),
        sort,
      ),
    [category, liveFeed.markets, sort],
  );

  return (
    <div className="markets-compact animate-enter">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <h1 className="page-title truncate">Markets</h1>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {filtered.length} native {filtered.length === 1 ? "market" : "markets"}
        </span>
      </div>

      <div
        className="markets-categories scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
        role="navigation"
        aria-label="Market categories"
      >
        {SPORTS_FILTERS.map((category) => (
          <Link
            key={category}
            to="/markets"
            search={(previous) => ({ ...previous, category })}
            aria-current={category === (search.category ?? "All") ? "true" : undefined}
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

      <div
        className="markets-sorting scrollbar-none -mx-4 mt-2 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
        role="navigation"
        aria-label="Market sorting"
      >
        {sortOptions.map((sort) => (
          <Link
            key={sort}
            to="/markets"
            search={(previous) => ({ ...previous, sort })}
            aria-current={sort === (search.sort ?? "Trending") ? "true" : undefined}
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
        <div className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      ) : sort === "Most active" || (!events.isPending && !otherMatches) ? (
        <div className="py-16 text-center">
          <p className="font-bold">
            {sort === "Most active" ? "No native activity yet" : "No markets in this category"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Try another category.</p>
        </div>
      ) : null}
      {sort === "Most active" ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Activity ranks native TacPredict markets only.
        </p>
      ) : (
        <>
          <DiscoveredEvents query={query} category={category} sort={sort} sportsOnly />
        </>
      )}
      <p className="mt-5 text-center text-[0.65rem] font-semibold text-muted-foreground">
        Base Mainnet · Native USDC · Financial state from TacPredict contracts
      </p>
    </div>
  );
}
