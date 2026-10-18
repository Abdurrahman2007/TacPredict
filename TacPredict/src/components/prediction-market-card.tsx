import { Link } from "@tanstack/react-router";
import type { Market } from "@/domain/markets/types";
import { marketSection } from "@/domain/markets/sections.mjs";
import { usdcShort, volumeText } from "@/lib/protocol/display.mjs";
import { MarketIcon } from "./market-icon";
import { OutcomeRow } from "./outcome-row";
import "@/styles/market-cards.css";

/** One renderer for admin-published, discovered and featured markets. */
export function PredictionMarketCard({
  market,
  featured = false,
}: {
  market: Market;
  featured?: boolean;
}) {
  const stamp = new Date(market.endsAt ?? "");
  const close = Number.isFinite(stamp.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(stamp) + " UTC"
    : market.closesAt;
  // Football's third outcome (Draw) must remain visible, not silently dropped.
  const outcomes = market.outcomes.slice(0, market.outcomes.length === 3 ? 3 : 2);
  return (
    <article className={`tp-market-card tp-card${featured ? " home-featured-card" : ""}`}>
      <div className="tp-card-meta">
        <span>{marketSection(market) ?? market.category}</span>
        <time dateTime={market.endsAt}>{close}</time>
      </div>
      <Link to="/markets/$marketId" params={{ marketId: market.id }} className="tp-card-title">
        <MarketIcon market={market} className="size-9 shrink-0" />
        <h3>{market.title}</h3>
      </Link>
      <div className="tp-card-outcomes">
        {outcomes.map((outcome, index) => (
          <Link
            key={outcome.id}
            to="/markets/$marketId"
            params={{ marketId: market.id }}
            search={{ outcome: outcome.id }}
            className="tp-card-outcome ios-press"
          >
            <OutcomeRow outcome={outcome} index={index} />
          </Link>
        ))}
      </div>
      <footer className="tp-card-footer">
        <span>
          {market.native ? `${usdcShort(market.native.openInterestAtomic)} OI` : "Listing pending"}
        </span>
        <span>{volumeText(market.volume)} Vol</span>
      </footer>
      {market.outcomes.length > 3 && (
        <Link className="tp-card-more" to="/markets/$marketId" params={{ marketId: market.id }}>
          View all {market.outcomes.length} outcomes ↗
        </Link>
      )}
    </article>
  );
}
