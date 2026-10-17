import type { MarketPreview } from "@/lib/agent/discovery.functions";
import { previewMarket } from "./prelaunch-markets";
import { PredictionDetail } from "./prediction-detail";
export function PreviewMarketDetail({
  preview,
  initial,
}: {
  preview: MarketPreview;
  initial?: string | undefined;
}) {
  return (
    <PredictionDetail market={previewMarket(preview)} asset={preview.asset} initial={initial} />
  );
}
