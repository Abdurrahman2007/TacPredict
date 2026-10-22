import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { UpDownSection } from "@/components/up-down-section";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { parseDuration } from "@/lib/updown/window.mjs";
import updownCss from "@/styles/updown.css?url";

export const Route = createFileRoute("/up-down")({
  validateSearch: (search: Record<string, unknown>): { d?: number } =>
    search["d"] === undefined ? {} : { d: parseDuration(search["d"]) },
  head: () => ({
    links: [{ rel: "stylesheet", href: updownCss }],
    meta: [{ title: "Up/Down — TacPredict" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(nativeMarketFeedQueryOptions),
  component: UpDownPage,
});

function UpDownPage() {
  const { d } = Route.useSearch();
  const { data: feed } = useSuspenseQuery(nativeMarketFeedQueryOptions);
  return (
    <div className="animate-enter mx-auto max-w-5xl">
      <h1 className="sr-only">Up/Down</h1>
      {feed.error && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {feed.error}
        </p>
      )}
      <UpDownSection
        key={d ?? 5}
        initialMinutes={d}
        detailed
        markets={feed.markets}
        snapshotTime={feed.updatedAt}
      />
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        Prices from Coinbase Exchange · Trades settle on TacPredict USDC markets
      </p>
    </div>
  );
}
