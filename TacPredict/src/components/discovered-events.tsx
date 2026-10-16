import { sortListings, type ListingSort } from "@/lib/markets/listing-sort.mjs";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, LockKeyhole } from "lucide-react";
import { eventDraftsQueryOptions, type EventDraft } from "@/lib/agent/events.functions";
import type { Market } from "@/domain/markets/types";
import { MarketCard } from "./market-card";
import { MarketIcon } from "./market-icon";
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
        (category === "All" || p.category === category) &&
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
export function EventDraftDetail({ event }: { event: EventDraft }) {
  const market = eventMarket(event);
  return (
    <article className="mx-auto max-w-3xl animate-enter">
      <Link
        to="/markets"
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft size={16} />
        Markets
      </Link>
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{market.category} · Discovered event</span>
        <span>{market.closesAt}</span>
      </div>
      <div className="mt-5 flex items-start gap-3">
        <MarketIcon market={market} />
        <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{market.title}</h1>
      </div>
      <div className="mt-7 space-y-3">
        {market.outcomes.map((o) => (
          <div
            key={o.id}
            className="flex min-h-16 justify-between items-center gap-4 rounded-2xl border border-border bg-card p-4"
          >
            <span className="font-medium">{o.label}</span>
            <span className="text-xl text-muted-foreground">0%</span>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <LockKeyhole size={15} />
          On-chain listing pending
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This is a discovered source event, not a live TacPredict contract. Resolution rules and
          source approval are required before listing.
        </p>
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-primary"
        >
          Source event
          <ExternalLink size={14} />
        </a>
      </div>
    </article>
  );
}
