import { DiscoveredEvents } from "@/components/discovered-events";
import { OutcomeRow } from "@/components/outcome-row";
import { MarketIcon } from "@/components/market-icon";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useEffect, useState } from "react";
import { CalendarDays, ChevronRight, Flame, Sparkles, TrendingUp } from "lucide-react";
import { MarketCard } from "@/components/market-card";
import { UpDownSection } from "@/components/up-down-section";
import { homeFeedListings } from "@/lib/markets/home-feed.mjs";
import { cryptoMarketQueryOptions, cryptoHistoryQueryOptions } from "@/lib/market-data.functions";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";

const feeds = ["Trending", "Live", "Upcoming", "New"] as const;
type Feed = (typeof feeds)[number];

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { feed?: Feed } =>
    feeds.includes(search["feed"] as Feed) ? { feed: search["feed"] as Feed } : {},
  head: () => ({
    meta: [
      { title: "TacPredict — Prediction Markets" },
      {
        name: "description",
        content:
          "Discover prediction markets across crypto, sports, technology, news, and business. Base and USDC prediction-market design preview.",
      },
      { property: "og:title", content: "TacPredict — Prediction Markets" },
      {
        property: "og:description",
        content: "Discover markets, make predictions, and explore outcomes with a Base wallet.",
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
  component: HomePage,
});

function HomePage() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const { feed = "Trending" } = Route.useSearch();
  const { data: crypto } = useQuery(cryptoMarketQueryOptions);
  const { data: btcHistory } = useQuery(cryptoHistoryQueryOptions("bitcoin"));
  const { data: nativeFeed } = useSuspenseQuery(nativeMarketFeedQueryOptions);
  const feedMarkets = useMemo(() => homeFeedListings(
    nativeFeed.markets, feed, Date.parse(nativeFeed.updatedAt),
  ).slice(0, 9), [feed, nativeFeed.markets, nativeFeed.updatedAt]);

  return (
    <div className="animate-enter">
      <div className="home-feed-tabs scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 py-2.5 sm:mx-0 sm:px-0">
        {feeds.map((item) => (
          <Link
            key={item}
            to="/"
            search={{ feed: item }}
            className={feed === item ? "filter-chip-active" : "filter-chip"}
          >
            {item === "Trending" ? (
              <Flame className="home-feed-icon" aria-hidden="true" strokeWidth={2} />
            ) : item === "Live" ? (
              <span className="home-live-dot" aria-hidden="true" />
            ) : item === "Upcoming" ? (
              <CalendarDays className="home-feed-icon" aria-hidden="true" strokeWidth={2} />
            ) : (
              <Sparkles className="home-feed-icon" aria-hidden="true" strokeWidth={2} />
            )}
            {item}
          </Link>
        ))}
      </div>


      {nativeFeed.error && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
        >
          {nativeFeed.error}
          {nativeFeed.markets.length === 0 && " Try refreshing in a moment."}
        </p>
      )}

      {!nativeFeed.error && nativeFeed.markets.length === 0 && (
        <p className="mt-4 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Pre-launch · USDC trading paused.
        </p>
      )}
      {feed === "Trending" && <UpDownSection
        crypto={crypto}
        histories={
          crypto
            ? { ...crypto.histories, bitcoin: [...(btcHistory ?? []), ...crypto.histories.bitcoin] }
            : undefined
        }
        liveMarkets={nativeFeed.cryptoUpDown}
        snapshotTime={nativeFeed.updatedAt}
      />}

      <SportsCarousel markets={feedMarkets} />
      {(feed === "Trending" || feed === "New") && <DiscoveredEvents sort={feed} />}

      {feedMarkets.length > 0 && <MarketSection title={feed} markets={feedMarkets} />}
      {(feed === "Live" || feed === "Upcoming") && !feedMarkets.length && !nativeFeed.error && (
        <p role="status" className="mt-6 rounded-2xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          {feed === "Live" ? "No live native markets right now." : "No upcoming native markets scheduled yet."}
        </p>
      )}
      {nativeFeed.markets.length > 0 && (
        <p className="mt-3 text-center text-[0.65rem] font-semibold text-muted-foreground">
          Own-market trades and volume indexed by {nativeFeed.source} · refreshed{" "}
          {hydrated ? new Date(nativeFeed.updatedAt).toISOString().slice(11, 16) + " UTC" : "—"}
        </p>
      )}
    </div>
  );
}

function SportsCarousel({
  markets: allMarkets,
}: {
  markets: import("@/domain/markets/types").Market[];
}) {
  const cards = [...allMarkets]
    .filter(
      (market, index, list) =>
        market.category === "Sports" && list.findIndex((item) => item.id === market.id) === index,
    )
    .slice(0, 8);
  if (cards.length === 0) return null;
  return (
    <section className="mt-7">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="section-title truncate">Top Sports Markets</h2>
        <Link
          to="/markets"
          search={{ category: "Sports", sort: "Trending", q: "" }}
          className="inline-flex shrink-0 items-center rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          View All <ChevronRight className="size-4" />
        </Link>
      </div>
      <div className="scrollbar-none -mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {cards.map((market) => (
          <Link
            key={market.id}
            to="/markets/$marketId"
            params={{ marketId: market.id }}
            className="ios-press w-[calc(100vw-3rem)] max-w-[24rem] shrink-0 snap-start rounded-[24px] border border-border bg-card p-5 sm:p-6"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-extrabold uppercase text-muted-foreground">
                <MarketIcon market={market} className="size-8" />
                {market.category}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">{market.closesAt}</span>
            </div>
            <h3 className="mt-3 line-clamp-2 text-lg font-semibold">{market.title}</h3>
            <div className="mt-5 space-y-4">
              {market.outcomes.slice(0, 2).map((outcome, index) => (
                <div key={outcome.id} className="flex items-center justify-between gap-2">
                  <OutcomeRow outcome={outcome} index={index} />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>
                {market.source === "Polymarket"
                  ? "Polymarket"
                  : `${market.participants.toLocaleString()} predictors`}
              </span>
              <span className="tabular-nums">{market.volume} Vol</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MarketSection({
  title,
  markets: sectionMarkets,
}: {
  title: string;
  markets: import("@/domain/markets/types").Market[];
}) {
  return (
    <section className="mt-7">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="section-title inline-flex min-w-0 items-center gap-2 truncate">
          <TrendingUp className="size-4 shrink-0 text-positive" />
          {title}
        </h2>
        <Link
          to="/markets"
          className="inline-flex shrink-0 items-center text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          See all <ChevronRight className="size-4" />
        </Link>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sectionMarkets.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>
    </section>
  );
}
