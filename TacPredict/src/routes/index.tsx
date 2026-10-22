import { eventMarket } from "@/lib/markets/event-market";
import { HomeMarketCard } from "@/components/home-market-card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Flame, Sparkles, ArrowUp } from "lucide-react";
import { UpDownSection } from "@/components/up-down-section";
import { homeFeedListings } from "@/lib/markets/home-feed.mjs";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { eventDraftsQueryOptions } from "@/lib/agent/events.functions";
import { sortListings } from "@/lib/markets/listing-sort.mjs";
import type { Market } from "@/domain/markets/types";
import { SECTIONS, marketSection, sectionOf, type Section } from "@/domain/markets/sections.mjs";
import homeCss from "@/styles/home-reference.css?url";
import updownCss from "@/styles/updown.css?url";

import { HOME_FEEDS, isSportsListing } from "@/lib/markets/public-tabs.mjs";
const feeds = HOME_FEEDS;
type Feed = (typeof feeds)[number];

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { feed?: Feed } =>
    feeds.includes(search["feed"] as Feed) ? { feed: search["feed"] as Feed } : {},
  head: () => ({
    links: [
      { rel: "stylesheet", href: homeCss },
      { rel: "stylesheet", href: updownCss },
    ],
    meta: [
      { title: "TacPredict — Prediction Markets" },
      {
        name: "description",
        content:
          "Explore live crypto price windows alongside Football and Cricket prediction markets on Base.",
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
  loader: async ({ context }) => {
    const [, events] = await Promise.all([
      context.queryClient.ensureQueryData(nativeMarketFeedQueryOptions),
      context.queryClient.ensureQueryData(eventDraftsQueryOptions).catch(() => null),
    ]);
    return { initialEvents: events, loadedAt: Date.now() };
  },
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
  const { data: nativeFeed } = useSuspenseQuery(nativeMarketFeedQueryOptions);
  const snapshot = Route.useLoaderData();
  const events = useQuery({
    ...eventDraftsQueryOptions,
    ...(snapshot.initialEvents !== null
      ? { initialData: snapshot.initialEvents, initialDataUpdatedAt: snapshot.loadedAt }
      : {}),
  });
  const native = useMemo(
    () =>
      homeFeedListings(
        nativeFeed.markets.filter(isSportsListing),
        feed,
        Date.parse(nativeFeed.updatedAt),
      ).filter((m) => !m.endsAt || Date.parse(m.endsAt) > Date.parse(nativeFeed.updatedAt)),
    [feed, nativeFeed],
  );
  const listings = useMemo(() => {
    const imported =
      feed === "Trending" || feed === "New"
        ? sortListings((events.data ?? []).filter(isSportsListing), feed).map(eventMarket)
        : [];
    const nativeQuestions = new Set(
      native.map((m) => m.title.toLowerCase().replace(/[^a-z0-9]/g, "")),
    );
    return [
      ...native,
      ...imported.filter(
        (m) => !nativeQuestions.has(m.title.toLowerCase().replace(/[^a-z0-9]/g, "")),
      ),
    ];
  }, [events.data, feed, native]);
  const featured = useMemo(() => {
    const ordered: Market[] = [];
    for (const section of SECTIONS) {
      const m = listings.find((m) => (marketSection(m) ?? sectionOf(m)) === section);
      if (m) ordered.push(m);
    }
    return ordered;
  }, [listings]);
  return (
    <div className="home-reference animate-enter">
      <nav className="home-feed-tabs home-reference-tabs scrollbar-none" aria-label="Market feed">
        {feeds.map((item) => (
          <Link
            key={item}
            to="/"
            search={{ feed: item }}
            aria-current={feed === item ? "page" : undefined}
            className={feed === item ? "filter-chip-active" : "filter-chip"}
          >
            {item === "Trending" ? (
              <Flame className="home-feed-icon" aria-hidden="true" />
            ) : item === "Live" ? (
              <span className="home-live-dot" aria-hidden="true" />
            ) : item === "Upcoming" ? (
              <CalendarDays className="home-feed-icon" aria-hidden="true" />
            ) : (
              <Sparkles className="home-feed-icon" aria-hidden="true" />
            )}
            {item}
          </Link>
        ))}
      </nav>
      {nativeFeed.error && (
        <p role="status" className="home-feed-notice">
          Native market data is temporarily unavailable. Please try again.
        </p>
      )}
      {(feed === "Trending" || feed === "New") && <FeaturedCarousel markets={featured} />}
      {(feed === "Trending" || feed === "Live") && (
        <div className="home-crypto-chart">
          <UpDownSection markets={nativeFeed.markets} snapshotTime={nativeFeed.updatedAt} />
          <div className="home-long-rounds">
            <UpDownSection
              fixedMinutes={60}
              markets={nativeFeed.markets}
              snapshotTime={nativeFeed.updatedAt}
            />
            <UpDownSection
              fixedMinutes={1440}
              markets={nativeFeed.markets}
              snapshotTime={nativeFeed.updatedAt}
            />
          </div>
        </div>
      )}
      <HomeSection
        title="Football"
        section="Football"
        markets={listings.filter((m) => (marketSection(m) ?? sectionOf(m)) === "Football")}
      />
      <HomeSection
        title="Cricket"
        section="Cricket"
        markets={listings.filter((m) => (marketSection(m) ?? sectionOf(m)) === "Cricket")}
      />
      {(feed === "Trending" || feed === "New") && events.isError && (
        <p role="status" className="home-feed-notice">
          Event discovery is temporarily unavailable.
        </p>
      )}
      {(feed === "Live" || feed === "Upcoming") && !listings.length && !nativeFeed.error && (
        <p role="status" className="home-empty">
          {feed === "Live"
            ? "No live native markets right now."
            : "No upcoming native markets scheduled yet."}
        </p>
      )}
      {listings.length > 6 && (
        <button
          type="button"
          className="home-back-top ios-press"
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
            })
          }
        >
          Back to top <ArrowUp size={16} />
        </button>
      )}
    </div>
  );
}
function HomeSection({
  title,
  section,
  markets,
}: {
  title: string;
  section: Section;
  markets: Market[];
}) {
  if (!markets.length) return null;
  return (
    <section className="home-serial-section" aria-label={title}>
      <div className="home-section-head">
        <h2>{title}</h2>
        <Link
          to="/markets"
          search={{ category: section, sort: "Trending", q: "" }}
          className="home-view-all ios-press"
        >
          View all <ChevronRight size={16} />
        </Link>
      </div>
      <div className="home-serial-grid">
        {markets.slice(0, 5).map((m) => (
          <HomeMarketCard key={m.id} market={m} />
        ))}
      </div>
    </section>
  );
}
const label = (m: Market | undefined) =>
  m ? (marketSection(m) ?? sectionOf(m) ?? m.category) : "";
function FeaturedCarousel({ markets }: { markets: Market[] }) {
  const rail = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  if (!markets.length) return null;
  const safe = Math.min(active, markets.length - 1);
  const move = (index: number) => {
    const next = (index + markets.length) % markets.length;
    const item = rail.current?.children[next] as HTMLElement | undefined;
    if (item && rail.current)
      rail.current.scrollTo({
        left: item.offsetLeft - rail.current.offsetLeft,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  };
  return (
    <section className="home-featured" aria-label="Featured predictions">
      <div
        className="home-featured-rail scrollbar-none"
        ref={rail}
        onScroll={() => {
          const el = rail.current;
          if (el?.firstElementChild)
            setActive(
              Math.min(
                markets.length - 1,
                Math.round(
                  el.scrollLeft / ((el.firstElementChild as HTMLElement).offsetWidth + 12),
                ),
              ),
            );
        }}
      >
        {markets.map((m) => (
          <HomeMarketCard key={m.id} market={m} featured />
        ))}
      </div>
      <div className="home-carousel-controls">
        <button aria-label="Previous featured prediction" onClick={() => move(safe - 1)}>
          <ChevronLeft size={16} />
          {label(markets[safe])}
        </button>
        <div className="home-carousel-dots">
          {markets.map((m, i) => (
            <button
              key={m.id}
              aria-label={`Show featured ${label(m)} prediction`}
              aria-pressed={safe === i}
              className={safe === i ? "active" : ""}
              onClick={() => move(i)}
            />
          ))}
        </div>
        <button aria-label="Next featured prediction" onClick={() => move(safe + 1)}>
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    </section>
  );
}
