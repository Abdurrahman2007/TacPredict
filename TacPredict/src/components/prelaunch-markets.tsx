import { sortListings, type ListingSort } from "@/lib/markets/listing-sort.mjs";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { marketPreviewsQueryOptions, type MarketPreview } from "@/lib/agent/discovery.functions";
import type { Market } from "@/domain/markets/types";
import { OutcomeRow } from "./outcome-row";

export function previewMarket(p: MarketPreview): Market {
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    closesAt:
      new Date(p.closeAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      }) + " UTC",
    endsAt: p.closeAt,
    volume: "$0",
    participants: 0,
    outcomes: [
      { id: "0", label: "Yes", probability: 0, probabilityKnown: false },
      { id: "1", label: "No", probability: 0, probabilityKnown: false },
    ],
    description: p.rules,
    source: "TacPredict preview",
    sourceUrl: p.sourceUrl,
    resolutionCriteria: p.rules,
    image: `/brand/crypto/${p.asset === "bitcoin" ? "btc" : p.asset === "ethereum" ? "eth" : "sol"}.svg`,
  };
}
export function PrelaunchMarkets({
  query = "",
  category = "All",
  sort = "Trending",
}: {
  query?: string;
  category?: string;
  sort?: ListingSort;
}) {
  const q = useQuery(marketPreviewsQueryOptions);
  const rows = sortListings(
    (q.data ?? []).filter(
      (p) =>
        (category === "All" || category === "Crypto") &&
        p.title.toLowerCase().includes(query.trim().toLowerCase()),
    ),
    sort,
  );
  if (q.isPending)
    return (
      <div
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Loading market previews"
        aria-busy="true"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-72 rounded-[28px] border border-border bg-card motion-safe:animate-pulse"
          />
        ))}
      </div>
    );
  if (!rows.length) return null;
  return (
    <section className="mt-7" aria-label="TacPredict pre-launch markets">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Predictions</h2>
        <span className="text-[11px] text-muted-foreground">Pre-launch</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => {
          const market = previewMarket(p);
          return (
            <article
              key={p.id}
              className="market-list-item rounded-[28px] border border-border bg-card p-5 sm:p-6"
            >
              <div className="mb-4 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>Crypto · Preview</span>
                <span>{market.closesAt}</span>
              </div>
              <Link
                to="/markets/$marketId"
                params={{ marketId: p.id }}
                className="flex items-start gap-3"
              >
                <img src={market.image} alt="" className="size-9 shrink-0" />
                <h3 className="min-w-0 text-lg font-semibold leading-snug">{p.title}</h3>
              </Link>
              <div className="mt-5 space-y-3">
                {market.outcomes.map((outcome, index) => (
                  <Link
                    key={outcome.id}
                    to="/markets/$marketId"
                    params={{ marketId: p.id }}
                    search={{ outcome: outcome.id }}
                    aria-label={`Predict ${outcome.label}: ${p.title}`}
                    className="ios-press flex min-h-14 items-center gap-3 rounded-xl"
                  >
                    <OutcomeRow outcome={outcome} index={index} />
                  </Link>
                ))}
              </div>
              <footer className="mt-5 flex justify-between border-t border-border/50 pt-4 text-xs text-muted-foreground">
                <span>$0 OI</span>
                <span>$0 Vol</span>
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
