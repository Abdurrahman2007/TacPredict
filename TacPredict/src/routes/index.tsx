import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { UpDownSection } from "@/components/up-down-section";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import homeCss from "@/styles/home-reference.css?url";
import updownCss from "@/styles/updown.css?url";

export const Route = createFileRoute("/")({
  head: () => ({
    links: [
      { rel: "stylesheet", href: homeCss },
      { rel: "stylesheet", href: updownCss },
    ],
    meta: [
      { title: "TacPredict — Prediction Markets" },
      {
        name: "description",
        content: "Virtual USDC crypto Up/Down markets on Base.",
      },
      { property: "og:title", content: "TacPredict — Prediction Markets" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(nativeMarketFeedQueryOptions);
    return { loadedAt: Date.now() };
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="py-16 text-center">
      <h1 className="page-title">Markets unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Please try again."}
      </p>
    </div>
  ),
  component: HomePage,
});

function HomePage() {
  const { data: nativeFeed } = useSuspenseQuery(nativeMarketFeedQueryOptions);
  const [showNote, setShowNote] = useState(false);
  return (
    <div className="home-reference">
      <div className="home-crypto-chart">
        <div className="tp-home-badge-row">
          <button
            type="button"
            className="tp-home-badge"
            aria-expanded={showNote}
            onClick={() => setShowNote((v) => !v)}
          >
            Virtual USDC · Paper <span aria-hidden>ⓘ</span>
          </button>
          {showNote ? (
            <p className="tp-home-virtual-note" role="note">
              Crypto only — Bitcoin, Ethereum, Solana and BNB. Prices in Virtual USDC ·
              Paper trading · Non-redeemable · No real money. Onchain Virtual USDC trades
              on Base Mainnet still need a real wallet signature and real ETH gas.
            </p>
          ) : null}
        </div>
        <UpDownSection
          detailed
          markets={nativeFeed.markets}
          snapshotTime={nativeFeed.updatedAt}
        />
        <div className="home-long-rounds">
          <UpDownSection
            fixedMinutes={30}
            markets={nativeFeed.markets}
            snapshotTime={nativeFeed.updatedAt}
          />
          <UpDownSection
            fixedMinutes={60}
            markets={nativeFeed.markets}
            snapshotTime={nativeFeed.updatedAt}
          />
          <UpDownSection
            fixedMinutes={720}
            markets={nativeFeed.markets}
            snapshotTime={nativeFeed.updatedAt}
          />
          <UpDownSection
            fixedMinutes={1440}
            markets={nativeFeed.markets}
            snapshotTime={nativeFeed.updatedAt}
          />
        </div>
      </div>
    </div>
  );
}
