import { createFileRoute, notFound } from "@tanstack/react-router";
import { UpDownDetail } from "@/components/updown/updown-detail";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { ASSETS, assetFromSlug, parseDuration } from "@/lib/updown/window.mjs";
import updownCss from "@/styles/updown.css?url";

export const Route = createFileRoute("/up-down_/$asset")({
  validateSearch: (search: Record<string, unknown>): { d?: number; w?: number } => {
    const out: { d?: number; w?: number } = {};
    const d = Number(search["d"]);
    if (Number.isFinite(d) && [5, 15, 60].includes(d)) out.d = d;
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
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(nativeMarketFeedQueryOptions).catch(() => null);
    return { loadedAt: Date.now() };
  },
  notFoundComponent: () => <div className="py-16 text-center">Market not found.</div>,
  component: UpDownAssetPage,
});

function UpDownAssetPage() {
  const { asset: slug } = Route.useParams();
  const search = Route.useSearch();
  const { loadedAt } = Route.useLoaderData();
  const asset = assetFromSlug(slug);
  if (!asset) return null;
  return (
    <UpDownDetail
      key={`${asset}-${search.d ?? 5}`}
      asset={asset}
      minutes={parseDuration(search.d)}
      windowParam={search.w}
      loadedAt={loadedAt}
    />
  );
}
