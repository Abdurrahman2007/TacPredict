import { PredictionDetail } from "./prediction-detail";
import { sortListings, type ListingSort } from "@/lib/markets/listing-sort.mjs";
import { useQuery } from "@tanstack/react-query";
import { eventDraftsQueryOptions, type EventDraft } from "@/lib/agent/events.functions";
import type { Market } from "@/domain/markets/types";
import { MarketCard } from "./market-card";
import { sectionOf } from "@/domain/markets/sections.mjs";
export function eventMarket(p: EventDraft): Market {
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    closesAt: new Date(p.closeAt).toISOString().slice(0, 16).replace("T", " ") + " UTC",
    endsAt: p.closeAt,
    volume: "$0",
    participants: 0,
    outcomes: p.outcomes.map((label, i) => ({
      id: String(i),
      label,
      probability: 0,
      probabilityKnown: false,
    })),
    description:
      "Source event discovered by the backend importer. Not a listed TacPredict on-chain market.",
    source: p.source,
    sourceUrl: p.sourceUrl,
    resolutionCriteria:
      "Independent TacPredict terms, source approval and on-chain publication are required.",
  };
}
export function DiscoveredEvents({
  query = "",
  category = "All",
  sort = "Trending",
}: {
  query?: string;
  category?: string;
  sort?: ListingSort;
}) {
  const q = useQuery(eventDraftsQueryOptions);
  const rows = sortListings(
    (q.data ?? []).filter(
      (p) =>
        (category === "All" ? sectionOf(p) !== null : sectionOf(p) === category) &&
        p.title.toLowerCase().includes(query.trim().toLowerCase()),
    ),
    sort,
  );
  if (q.isPending)
    return (
      <div
        className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Loading discovered events"
        aria-busy="true"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-60 rounded-3xl border border-border bg-card motion-safe:animate-pulse"
          />
        ))}
      </div>
    );
  if (q.isError)
    return (
      <p role="status" className="mt-6 text-xs text-muted-foreground">
        Event discovery feed is temporarily unavailable.
      </p>
    );
  if (!rows.length) return null;
  return (
    <section className="mt-7" aria-label="Discovered events">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">
          Events{" "}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{rows.length}</span>
        </h2>
        <span className="text-[11px] text-muted-foreground">Discovered · Listing pending</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => (
          <MarketCard key={p.id} market={eventMarket(p)} />
        ))}
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">
        Gamma metadata discovery only. Prices and volume are not copied.
      </p>
    </section>
  );
}
export function EventDraftDetail({
  event,
  initial,
}: {
  event: EventDraft;
  initial?: string | undefined;
}) {
  return <PredictionDetail market={eventMarket(event)} initial={initial} />;
}
