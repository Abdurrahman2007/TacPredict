import { PredictionDetail } from "@/components/prediction-detail";
import { EventDraftDetail } from "@/components/discovered-events";
import { eventDraftsQueryOptions } from "@/lib/agent/events.functions";
import { PreviewMarketDetail } from "@/components/preview-market-detail";
import { marketPreviewsQueryOptions } from "@/lib/agent/discovery.functions";
import { NativePublicResolution } from "@/components/native-public-resolution";
import { NativeMakerTools } from "@/components/native-maker-tools";
import { NativeMarketTerms, NativeActivity } from "@/components/native-market-data";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";

export const Route = createFileRoute("/markets/$marketId")({
  validateSearch: (search: Record<string, unknown>): { outcome?: string } =>
    typeof search["outcome"] === "string" ? { outcome: search["outcome"] } : {},
  head: () => ({
    meta: [
      { title: "Market — TacPredict" },
      {
        name: "description",
        content:
          "Explore market outcomes and resolution rules. Base USDC trading integration is pending.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(nativeMarketFeedQueryOptions),
  component: MarketDetailPage,
});
function MarketDetailPage() {
  const { marketId } = Route.useParams();
  const { outcome: initial } = Route.useSearch();
  const { data: feed } = useSuspenseQuery(nativeMarketFeedQueryOptions);
  const previews = useQuery({
    ...marketPreviewsQueryOptions,
    enabled: marketId.startsWith("preview-"),
  });
  const eventDrafts = useQuery({
    ...eventDraftsQueryOptions,
    enabled: marketId.startsWith("event-"),
  });
  const market = [...feed.markets, ...Object.values(feed.cryptoUpDown)].find(
    (item) => item?.id === marketId,
  );
  const draftEvent = eventDrafts.data?.find((p) => p.id === marketId);
  if (draftEvent)
    return <EventDraftDetail key={draftEvent.id} event={draftEvent} initial={initial} />;
  if (marketId.startsWith("event-") && eventDrafts.isPending)
    return (
      <div role="status" className="py-16 text-center">
        Loading event…
      </div>
    );
  const preview = previews.data?.find((p) => p.id === marketId);
  if (preview) return <PreviewMarketDetail key={preview.id} preview={preview} initial={initial} />;
  if (marketId.startsWith("preview-") && previews.isPending)
    return (
      <div role="status" className="py-16 text-center text-muted-foreground">
        Loading prediction…
      </div>
    );
  if (!market)
    return (
      <div className="py-16 text-center">
        <h1 className="page-title">Market not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This market is not in the current discovery feed.
        </p>
        <Button asChild className="mt-5">
          <Link to="/markets">Back to markets</Link>
        </Button>
      </div>
    );
  return (
    <PredictionDetail key={market.id} market={market} initial={initial}>
      {market.native && (
        <>
          <NativeMarketTerms market={market.native} />
          <NativeMakerTools
            market={market.native}
            deployment={feed.deployments.find((d) => d.chainId === market.native!.chainId)}
          />
          <NativePublicResolution
            market={market.native}
            deployment={feed.deployments.find((d) => d.chainId === market.native!.chainId)}
          />
          <NativeActivity marketId={market.id} />
        </>
      )}
    </PredictionDetail>
  );
}
