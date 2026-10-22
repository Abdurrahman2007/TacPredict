import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UpDownDetail } from "@/components/updown/updown-detail";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { ASSETS, DURATIONS, assetFromSlug, parseDuration } from "@/lib/updown/window.mjs";
import updownCss from "@/styles/updown.css?url";

export const Route = createFileRoute("/up-down_/$asset")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { d?: number; w?: number; side?: "up" | "down" } => {
    const out: { d?: number; w?: number; side?: "up" | "down" } = {};
    if (search["side"] === "up" || search["side"] === "down") out.side = search["side"];
    const d = Number(search["d"]);
    if (Number.isFinite(d) && DURATIONS.includes(d)) out.d = d;
    const w = Number(search["w"]);
    if (search["w"] !== undefined && Number.isFinite(w) && w > 0) out.w = w;
    return out;
  },
  beforeLoad: ({ params }) => {
    if (!assetFromSlug(params.asset)) throw notFound();
  },
  head: ({ params }) => {
    const asset = assetFromSlug(params.asset);
    return {
      links: [{ rel: "stylesheet", href: updownCss }],
      meta: [{ title: `${asset ? ASSETS[asset].name : "Up/Down"} Up or Down — TacPredict` }],
    };
  },
  loader: ({ context }) => {
    // Reference price navigation must not wait for a slow database/indexer read.
    void context.queryClient.prefetchQuery(nativeMarketFeedQueryOptions);
  },
  notFoundComponent: () => <div className="py-16 text-center">Market not found.</div>,
  component: UpDownAssetPage,
});

function UpDownAssetPage() {
  const { asset: slug } = Route.useParams();
  const search = Route.useSearch();
  // The feed snapshot time is dehydrated with the query, so server and browser start from the
  // same clock value and the countdown does not mismatch on hydration.
  const feed = useQuery(nativeMarketFeedQueryOptions);
  const loadedAt = Date.parse(feed.data?.updatedAt ?? "") || 0;
  const asset = assetFromSlug(slug);
  if (!asset) return null;
  return (
    <UpDownDetail
      key={`${asset}-${search.d ?? 5}`}
      asset={asset}
      minutes={parseDuration(search.d)}
      windowParam={search.w}
      loadedAt={loadedAt}
      initialSide={search.side}
    />
  );
}
