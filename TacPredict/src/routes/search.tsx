import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useDeferredValue, useState } from "react";
import { Search, X } from "lucide-react";
import { eventDraftsQueryOptions } from "@/lib/agent/events.functions";
import { marketPreviewsQueryOptions } from "@/lib/agent/discovery.functions";
import { eventMarket } from "@/components/discovered-events";
import { previewMarket } from "@/components/prelaunch-markets";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { MarketIcon } from "@/components/market-icon";
import { searchListings } from "@/lib/markets/search-list.mjs";
import searchStyles from "@/styles/search-discovery.css?url";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "Search — TacPredict" }], links: [{ rel: "stylesheet", href: searchStyles }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(nativeMarketFeedQueryOptions),
  component: SearchPage,
});
function SearchPage() {
  const events = useQuery(eventDraftsQueryOptions);
  const previews = useQuery(marketPreviewsQueryOptions);
  const { data: feed } = useSuspenseQuery(nativeMarketFeedQueryOptions);
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim());
  const rows = searchListings([
    ...feed.markets,
    ...Object.values(feed.cryptoUpDown).filter((m): m is NonNullable<typeof m> => Boolean(m)),
    ...(events.data ?? []).map(eventMarket),
    ...(previews.data ?? []).map(previewMarket),
  ], q);
  const loading = events.isPending || previews.isPending;
  return (
    <section className="tp-search animate-enter" aria-label="Market search">
      <h1 className="sr-only">Search markets</h1>
      <div className="tp-search-field">
        <Search aria-hidden="true" className="size-6 shrink-0" strokeWidth={2} />
        <input aria-label="Search markets" placeholder="Search markets…" type="search" autoComplete="off" spellCheck={false} value={query} onChange={e => setQuery(e.target.value)} />
        {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X className="size-5" aria-hidden="true" /></button>}
      </div>
      <div className="tp-search-heading">
        <h2>{q ? "Search results" : "Featured"}</h2>
        {q && <span>{rows.length} {rows.length === 1 ? "match" : "matches"}</span>}
      </div>
      <div className="tp-search-results" aria-live="polite" aria-busy={loading}>
        {rows.slice(0, q ? 40 : 10).map(m => (
          <Link key={m.id} to="/markets/$marketId" params={{ marketId: m.id }} className="tp-search-row ios-press">
            <MarketIcon market={m} className="size-11 shrink-0" />
            <span className="tp-search-title">{m.title}</span>
            <span className="tp-search-meta">
              {m.native ? <>{m.volume}<small>Vol</small></> : m.id.startsWith("event-") ? "Listing pending" : "Preview"}
            </span>
          </Link>
        ))}
        {loading && rows.length === 0 && [0, 1, 2, 3].map(i => <div key={i} className="tp-search-skeleton" aria-hidden="true" />)}
        {!loading && rows.length === 0 && <p className="tp-search-empty">{q ? "No matches. Try another search." : "No markets available yet."}</p>}
      </div>
      {(events.isError || previews.isError || feed.error) && <p role="status" className="tp-search-notice">Some listings could not load. Try refreshing.</p>}
    </section>
  );
}
