import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, X } from "lucide-react";
import type { Market } from "@/domain/markets/types";
import { cryptoMarketQueryOptions } from "@/lib/market-data.functions";
import { useNativePortfolio } from "@/lib/protocol/portfolio";
import { sharesShort, usdcShort } from "@/lib/protocol/display.mjs";
import { durationMinutes, marketDurationLabel, marketWindowLabel } from "@/lib/market-timing";
import { MarketIcon } from "./market-icon";
import { MarketCountdown } from "./market-countdown";
import { CryptoDetailChart } from "./crypto-detail-chart";
import { ProbabilityHistoryChart } from "./probability-history";
import { MobileOutcomeDock } from "./mobile-outcome-dock";
import { PredictionAmountCard } from "./prediction-amount-card";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "./ui/dialog";
import "@/styles/prediction-detail.css";

type Asset = "bitcoin" | "ethereum" | "solana";
export function assetForMarket(m: Market): Asset | undefined {
  if (m.category !== "Crypto") return undefined;
  return /\b(bitcoin|btc)\b/i.test(m.title)
    ? "bitcoin"
    : /\b(ethereum|eth)\b/i.test(m.title)
      ? "ethereum"
      : /\b(solana|sol)\b/i.test(m.title)
        ? "solana"
        : undefined;
}
export function MarketIsland({
  market,
  selected,
}: {
  market: Market;
  selected?: string | undefined;
}) {
  const asset = assetForMarket(market);
  const q = useQuery({ ...cryptoMarketQueryOptions, enabled: Boolean(asset) });
  const spot = asset ? q.data?.[asset] : undefined;
  const duration = marketDurationLabel(market);
  const name =
    asset && duration ? `${asset[0]!.toUpperCase()}${asset.slice(1)} · ${duration}` : market.title;
  return (
    <div className="pd-island">
      <MarketIcon market={market} />
      <div className="pd-island-copy">
        <strong>{name}</strong>
        <div className="pd-island-meta">
          {market.native && market.startsAt && market.endsAt ? (
            <MarketCountdown market={market} snapshotTime={new Date().toISOString()} />
          ) : (
            <span>{market.native ? market.native.status : "Listing pending"}</span>
          )}
          {spot && (
            <span className="pd-island-price">
              $
              {spot.price.toLocaleString("en-US", {
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              })}
              {q.data?.stale ? " · delayed" : ""}
            </span>
          )}
        </div>
      </div>
      {selected && <span className="pd-side-badge">{selected}</span>}
    </div>
  );
}
export function PredictionDetail({
  market,
  initial,
  children,
  asset: givenAsset,
}: {
  market: Market;
  initial?: string | undefined;
  children?: ReactNode;
  asset?: Asset;
}) {
  const asset = givenAsset ?? assetForMarket(market);
  const [selected, setSelected] = useState(initial || market.outcomes[0]?.id || "0");
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [tab, setTab] = useState("Positions");
  const heading = useRef<HTMLDivElement>(null);
  const portfolio = useNativePortfolio();
  useEffect(() => {
    setSelected(initial || market.outcomes[0]?.id || "0");
    setOpen(Boolean(initial && window.matchMedia("(max-width:1023px)").matches));
  }, [initial, market.id]);
  useEffect(() => {
    const target = heading.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry?.isIntersecting), {
      rootMargin: "-76px 0px 0px 0px",
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [market.id]);
  const chosen = market.outcomes.find((o) => o.id === selected) ?? market.outcomes[0];
  const select = (id: string) => {
    setSelected(id);
    if (window.matchMedia("(max-width:1023px)").matches) setOpen(true);
  };
  const positions = (portfolio.data?.positions ?? []).filter(
    (p) => p.marketId === market.native?.id && p.chainId === market.native?.chainId,
  );
  const activity = (portfolio.data?.activity ?? []).filter(
    (a) => a.marketId === market.native?.id && a.chainId === market.native?.chainId,
  );
  const knownValue = positions.every((p) => p.valueAtomic !== null);
  const total = positions.reduce((n, p) => n + BigInt(p.valueAtomic ?? "0"), 0n);
  return (
    <div className="pd-page animate-enter">
      <Link to="/markets" className="pd-back">
        <ArrowLeft size={17} /> Markets
      </Link>
      {mounted &&
        createPortal(
          <div
            className={`pd-floating-island ${compact ? "is-visible" : ""}`}
            aria-hidden={!compact}
          >
            <MarketIsland market={market} />
          </div>,
          document.body,
        )}
      <div className="pd-grid">
        <article className="min-w-0">
          <div ref={heading} className="pd-heading">
            <div className="pd-category">
              {market.category}
              <span>{market.native ? market.native.status : "Listing pending"}</span>
            </div>
            <div className="pd-title-row">
              <MarketIcon market={market} />
              <div>
                <h1>
                  {asset && marketDurationLabel(market)
                    ? `${asset[0]!.toUpperCase()}${asset.slice(1)} · ${marketDurationLabel(market)}`
                    : market.title}
                </h1>
                <p>{marketWindowLabel(market) || market.closesAt}</p>
              </div>
              {market.native && market.startsAt && (
                <MarketCountdown market={market} snapshotTime={new Date().toISOString()} />
              )}
            </div>
          </div>
          {asset ? (
            <CryptoDetailChart asset={asset} initialMinutes={durationMinutes(market) ?? 15} />
          ) : market.native ? (
            <ProbabilityHistoryChart market={market} />
          ) : null}
          {!market.native && (
            <p className="pd-data-note">
              Not a live TacPredict contract. Displayed zeros mean no native trading data, not free
              shares.{" "}
              {asset
                ? "Spot prices are references, not prediction odds or settlement evidence."
                : ""}
            </p>
          )}
          {market.outcomes.length > 2 && (
            <div className="pd-extra-outcomes">
              {market.outcomes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={selected === o.id}
                  onClick={() => select(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          <section className="pd-position-card" aria-label="Your positions and history">
            <div className="pd-segments">
              {["Positions", "History"].map((t) => (
                <button type="button" key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
            </div>
            {portfolio.isError ? (
              <p role="status">Account data unavailable. No estimate is substituted.</p>
            ) : tab === "Positions" ? (
              positions.length ? (
                positions.map((p) => (
                  <div className="pd-position-row" key={p.id}>
                    <span>
                      {p.outcome} · {sharesShort(p.sharesAtomic)} shares
                    </span>
                    <strong>{usdcShort(p.valueAtomic)}</strong>
                  </div>
                ))
              ) : (
                <p>{portfolio.isFetching ? "Loading your positions…" : "No positions"}</p>
              )
            ) : activity.length ? (
              activity.map((a) => (
                <a
                  className="pd-position-row"
                  key={a.id}
                  href={`https://${a.chainId === 84532 ? "sepolia." : ""}basescan.org/tx/${a.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>{a.kind}</span>
                  <span>{usdcShort(a.amountAtomic)}</span>
                </a>
              ))
            ) : (
              <p>No confirmed activity</p>
            )}
            <div className="pd-position-footer">
              <strong>
                Total {usdcShort(total.toString())}
                {!knownValue || portfolio.isError ? " · awaiting data" : ""}
              </strong>
              <Link to="/profile">
                View all <ArrowUpRight size={16} />
              </Link>
            </div>
          </section>
          <section className="pd-statistics">
            <h2>Statistics</h2>
            {[
              ["Open interest", usdcShort(market.native?.openInterestAtomic)],
              ["Traded volume", usdcShort(market.native?.volumeAtomic)],
              ["Traders", String(market.native?.traders ?? 0)],
            ].map(([label, value]) => (
              <div className="pd-stat" key={label}>
                <span>{label}</span>
                <i />
                <strong>{value}</strong>
              </div>
            ))}
          </section>
          <section className="pd-rules">
            <h2>Rules summary</h2>
            <p>{market.description}</p>
            <details>
              <summary>Show resolution rules</summary>
              <p>{market.resolutionCriteria}</p>
              <a href={market.sourceUrl} target="_blank" rel="noopener noreferrer">
                View source <ArrowUpRight size={15} />
              </a>
            </details>
          </section>
          {children}
          <button
            type="button"
            className="pd-back-top"
            onClick={() =>
              window.scrollTo({
                top: 0,
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
              })
            }
          >
            Back to top ↑
          </button>
        </article>
        <aside className="pd-desktop-trade">
          <PredictionAmountCard market={market} selected={chosen?.id} onSelect={setSelected} />
        </aside>
      </div>
      <MobileOutcomeDock market={market} selected={chosen?.id} onSelect={select} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="pd-trade-screen translate-x-0 translate-y-0 lg:-translate-x-1/2">
          <DialogTitle className="sr-only">Trade {market.title}</DialogTitle>
          <DialogDescription className="sr-only">
            Choose Buy or Sell, select an outcome and review an order. No funds move until you
            approve in your wallet.
          </DialogDescription>
          <div className="pd-trade-top">
            <div className="pd-handle" />
            <MarketIsland market={market} selected={chosen?.label} />
            <DialogClose className="pd-close" aria-label="Close trade screen">
              <X size={18} />
            </DialogClose>
          </div>
          <div className="pd-trade-content">
            <PredictionAmountCard market={market} selected={chosen?.id} onSelect={setSelected} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
