import { MarketIcon } from "@/components/market-icon";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { CalendarDays, ChevronRight, Flame, Radio, Sparkles, TrendingUp } from "lucide-react";
import { MarketCard } from "@/components/market-card";
import { UpDownSection } from "@/components/up-down-section";
import { Button } from "@/components/ui/button";
import { categories } from "@/domain/markets/demo-markets";
import { cryptoMarketQueryOptions } from "@/lib/market-data.functions";
import { polymarketFeedQueryOptions } from "@/lib/polymarket.functions";

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
  component: HomePage,
});

function HomePage() {
  const { feed = "Trending" } = Route.useSearch();
  const { data: crypto } = useQuery(cryptoMarketQueryOptions);
  const { data: polymarket } = useSuspenseQuery(polymarketFeedQueryOptions);
  const feedMarkets = useMemo(() => {
    const liveMarkets = polymarket.markets;
    const sorted = [...liveMarkets];
    if (feed === "New")
      sorted.sort(
        (a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0),
      );
    if (feed === "Upcoming")
      sorted.sort(
        (a, b) =>
          (Date.parse(a.endsAt ?? "") || Number.MAX_SAFE_INTEGER) -
          (Date.parse(b.endsAt ?? "") || Number.MAX_SAFE_INTEGER),
      );
    return sorted.slice(0, 9);
  }, [feed, polymarket.markets]);

  return (
    <div className="animate-enter">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="section-kicker">BASE / USDC</p>
          <h1 className="page-title">Make your call.</h1>
          <p className="mt-2 text-sm text-muted-foreground">Explore the odds. Find your edge.</p>
        </div>
        <img
          src="/brand/tacpredict.svg"
          alt=""
          width={56}
          height={56}
          className="size-14 shrink-0 rounded-2xl"
        />
      </div>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        External market-data preview · Base trading contracts not connected
      </p>
      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 py-2.5 sm:mx-0 sm:px-0">
        {feeds.map((item) => (
          <Link
            key={item}
            to="/"
            search={{ feed: item }}
            className={feed === item ? "filter-chip-active" : "filter-chip"}
          >
            {item === "Trending" ? (
              <Flame className="mr-1 inline size-3.5" />
            ) : item === "Live" ? (
              <Radio className="mr-1 inline size-3.5 text-primary" />
            ) : item === "Upcoming" ? (
              <CalendarDays className="mr-1 inline size-3.5" />
            ) : (
              <Sparkles className="mr-1 inline size-3.5" />
            )}
            {item}
          </Link>
        ))}
      </div>

      {polymarket.error && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
        >
          {polymarket.error}
          {polymarket.markets.length === 0 && " Try refreshing in a moment."}
        </p>
      )}
      <SportsCarousel markets={feedMarkets} />

      {crypto && (
        <UpDownSection
          crypto={crypto}
          histories={crypto.histories}
          liveMarkets={polymarket.cryptoUpDown}
        />
      )}

      <div className="scrollbar-none -mx-4 mt-7 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {categories.slice(0, 7).map((category, index) => (
          <Link
            key={category}
            to="/markets"
            search={{ category, sort: "Trending", q: "" }}
            className={index === 0 ? "filter-chip-active" : "filter-chip"}
          >
            {category}
          </Link>
        ))}
      </div>

      <MarketSection title={feed} markets={feedMarkets} />
      <p className="mt-3 text-center text-[0.65rem] font-semibold text-muted-foreground">
        Market odds and volume supplied by {polymarket.source} · refreshed{" "}
        {new Date(polymarket.updatedAt).toISOString().slice(11, 16) + " UTC"}
      </p>

      <section className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <p className="text-base font-semibold">Built for Base. Designed for your wallet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Native USDC balance reads are ready. Market contracts are not connected yet.
          </p>
        </div>
        <Button variant="outline" className="h-11 rounded-xl" asChild>
          <Link to="/profile">Open portfolio</Link>
        </Button>
      </section>
    </div>
  );
}

const multiplier = (probability: number) =>
  probability > 0 ? `${(100 / probability).toFixed(2)}x` : "—";

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
            className="ios-press w-[19rem] shrink-0 snap-start rounded-lg border border-border bg-card p-5 shadow-card"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-extrabold uppercase text-muted-foreground">
                <MarketIcon market={market} className="size-8" />
                {market.category}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">{market.closesAt}</span>
            </div>
            <h3 className="mt-2 line-clamp-1 text-[0.95rem] font-bold">{market.title}</h3>
            <div className="mt-3 space-y-2.5">
              {market.outcomes.slice(0, 2).map((outcome, index) => (
                <div key={outcome.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{outcome.label}</span>
                    <progress
                      className={
                        index === 0
                          ? "outcome-progress outcome-progress-positive mt-1"
                          : "outcome-progress outcome-progress-negative mt-1"
                      }
                      value={outcome.probability}
                      max={100}
                      aria-label={`${outcome.label} ${outcome.probability}%`}
                    />
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-muted-foreground">
                    {multiplier(outcome.probability)}
                  </span>
                  <span
                    className={
                      index === 0
                        ? "shrink-0 rounded-full bg-positive-soft px-3 py-1.5 text-sm font-bold tabular-nums text-positive"
                        : "shrink-0 rounded-full bg-destructive/10 px-3 py-1.5 text-sm font-bold tabular-nums text-destructive"
                    }
                  >
                    {outcome.probability}%
                  </span>
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
      <div className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-3">
        {sectionMarkets.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>
    </section>
  );
}
