import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { Search, X, Flame, Radio, CalendarDays, Sparkles } from "lucide-react";
import { polymarketFeedQueryOptions } from "@/lib/polymarket.functions";
import { MarketIcon } from "@/components/market-icon";
const filters = ["Trending", "Live", "Upcoming", "New"] as const;
export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "Search — TacPredict" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(polymarketFeedQueryOptions),
  component: SearchPage,
});
function SearchPage() {
  const { data: feed } = useSuspenseQuery(polymarketFeedQueryOptions);
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());
  const [filter, setFilter] = useState<(typeof filters)[number]>("Trending");
  const markets = [
    ...new Map(
      [...feed.markets, ...Object.values(feed.cryptoUpDown).filter(Boolean)].map((m) => [
        m!.id,
        m!,
      ]),
    ).values(),
  ];
  const words = q
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      ["btc", "bitcoin"].includes(word)
        ? ["btc", "bitcoin"]
        : ["eth", "ethereum"].includes(word)
          ? ["eth", "ethereum"]
          : ["sol", "solana"].includes(word)
            ? ["sol", "solana"]
            : [word],
    );
  const results = markets.filter((m) =>
    words.every((aliases) =>
      aliases.some((word) =>
        `${m.title} ${m.category} ${m.outcomes.map((o) => o.label).join(" ")}`
          .toLowerCase()
          .includes(word),
      ),
    ),
  );
  if (filter === "New")
    results.sort(
      (a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0),
    );
  if (filter === "Upcoming")
    results.sort(
      (a, b) =>
        (Date.parse(a.endsAt ?? "") || Number.MAX_SAFE_INTEGER) -
        (Date.parse(b.endsAt ?? "") || Number.MAX_SAFE_INTEGER),
    );
  return (
    <div className="animate-enter mx-auto max-w-4xl">
      <h1 className="sr-only">Search markets</h1>
      <div className="scrollbar-none -mx-4 mb-6 flex gap-2 overflow-auto px-4 sm:mx-0 sm:px-0">
        {filters.map((item, i) => {
          const Icon = [Flame, Radio, CalendarDays, Sparkles][i]!;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
              className={filter === item ? "filter-chip-active" : "filter-chip"}
            >
              <Icon className="mr-1.5 inline size-4" />
              {item}
            </button>
          );
        })}
      </div>
      <div className="flex min-h-14 items-center gap-3 rounded-full border border-border bg-card px-5 focus-within:border-[#57a6ff] focus-within:ring-1 focus-within:ring-[#57a6ff]">
        <Search className="size-5 shrink-0 text-muted-foreground" />
        <input
          aria-label="Search markets"
          style={{ outline: "none" }}
          placeholder="Search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="grid size-11 shrink-0 place-items-center"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {!q && (
        <div
          className="scrollbar-none mt-4 flex gap-2 overflow-x-auto"
          aria-label="Suggested searches"
        >
          {["Bitcoin", "Solana", "Sports", "News"]
            .filter((term) =>
              markets.some((m) =>
                `${m.title} ${m.category}`.toLowerCase().includes(term.toLowerCase()),
              ),
            )
            .map((term) => (
              <button
                type="button"
                key={term}
                onClick={() => setQuery(term)}
                className="min-h-11 rounded-full bg-secondary px-4 text-sm text-muted-foreground"
              >
                {term}
              </button>
            ))}
        </div>
      )}
      <h2 className="mb-3 mt-7 text-base font-medium text-muted-foreground">
        {q ? `Results · ${results.length}` : "Featured"}
      </h2>
      <div className="space-y-1" aria-live="polite">
        {results.slice(0, q ? 30 : 8).map((m) => (
          <Link
            key={m.id}
            to="/markets/$marketId"
            params={{ marketId: m.id }}
            className="ios-press flex min-h-20 items-center gap-3 rounded-2xl px-1 py-3 hover:bg-card"
          >
            <MarketIcon market={m} className="size-10 shrink-0" />
            <span className="line-clamp-2 min-w-0 flex-1 text-base font-medium">{m.title}</span>
            <span
              title={`${m.source} source volume`}
              className="shrink-0 text-right text-xs tabular-nums text-muted-foreground"
            >
              {m.volume}
              <span className="mt-1 block">Vol</span>
            </span>
          </Link>
        ))}
        {results.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {q ? "No matches" : "Markets unavailable"}
          </p>
        )}
      </div>
    </div>
  );
}
