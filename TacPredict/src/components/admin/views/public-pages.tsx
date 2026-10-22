import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  HOME_FEEDS,
  MARKET_SORTS,
  SPORTS_FILTERS,
  isSportsListing,
} from "@/lib/markets/public-tabs.mjs";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { eventDraftsQueryOptions } from "@/lib/agent/events.functions";
import { homeFeedListings } from "@/lib/markets/home-feed.mjs";
import { sortListings } from "@/lib/markets/listing-sort.mjs";
import { eventMarket } from "@/lib/markets/event-market";
import { MarketIcon } from "@/components/market-icon";
import { marketSection } from "@/domain/markets/sections.mjs";
import { ASSETS, ASSET_KEYS } from "@/lib/updown/window.mjs";
import { cryptoLogoUrl } from "@/lib/crypto-logo";
import { Card, PageHeader } from "../admin-ui";

/** Mirrors public navigation using the same definitions and data, not independent fake tab settings. */
export function PublicPagesView() {
  const [page, setPage] = useState<"Home" | "Markets">("Home");
  const [feed, setFeed] = useState<(typeof HOME_FEEDS)[number]>("Trending");
  const [sort, setSort] = useState<(typeof MARKET_SORTS)[number]>("Trending");
  const [category, setCategory] = useState<(typeof SPORTS_FILTERS)[number]>("All");
  const native = useQuery(nativeMarketFeedQueryOptions);
  const events = useQuery(eventDraftsQueryOptions);
  const now = Date.parse(native.data?.updatedAt ?? "") || Date.now();
  const live = (native.data?.markets ?? []).filter(isSportsListing);
  const imported = (events.data ?? []).filter(isSportsListing).map(eventMarket);
  const homeNative = homeFeedListings(live, feed, now).filter(
    (m) => !m.endsAt || Date.parse(m.endsAt) > now,
  );
  const nativeTitles = new Set(
    homeNative.map((m) => m.title.toLowerCase().replace(/[^a-z0-9]/g, "")),
  );
  const home = [
    ...homeNative,
    ...(feed === "Trending" || feed === "New"
      ? sortListings(imported, feed).filter(
          (m) => !nativeTitles.has(m.title.toLowerCase().replace(/[^a-z0-9]/g, "")),
        )
      : []),
  ];
  const marketRows = sortListings([...live, ...(sort === "Most active" ? [] : imported)], sort);
  const rows = (page === "Home" ? home : marketRows).filter(
    (m) => category === "All" || marketSection(m) === category,
  );
  return (
    <div className="adm-stack">
      <PageHeader title="Home & Markets" subtitle="Public tabs, live cards and sports listings." />
      <nav className="adm-tabs" aria-label="Public page">
        {(["Home", "Markets"] as const).map((p) => (
          <button
            key={p}
            type="button"
            className="adm-tab"
            aria-pressed={page === p}
            onClick={() => setPage(p)}
          >
            {p}
          </button>
        ))}
      </nav>
      <Card title={page === "Home" ? "Home tabs" : "Market tabs"}>
        <div className="adm-public-controls" role="group" aria-label={`${page} feed tabs`}>
          {page === "Home"
            ? HOME_FEEDS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="adm-btn"
                  aria-pressed={feed === t}
                  onClick={() => setFeed(t)}
                >
                  {t}
                </button>
              ))
            : MARKET_SORTS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="adm-btn"
                  aria-pressed={sort === t}
                  onClick={() => setSort(t)}
                >
                  {t}
                </button>
              ))}
        </div>
        <div className="adm-public-controls" role="group" aria-label="Public sport categories">
          {SPORTS_FILTERS.map((t) => (
            <button
              key={t}
              type="button"
              className="adm-btn"
              aria-pressed={category === t}
              onClick={() => setCategory(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </Card>
      {page === "Home" && (feed === "Trending" || feed === "Live") && (
        <Card title="Live crypto · 5 min / 1H / 24H">
          <div className="adm-public-live">
            {ASSET_KEYS.map((a) => (
              <div key={a}>
                <img src={cryptoLogoUrl(ASSETS[a].logo)} alt="" width={28} height={28} />
                <b>{ASSETS[a].short}</b>
                {([5, 60, 1440] as const).map((d) => (
                  <Link
                    key={d}
                    to="/up-down/$asset"
                    params={{ asset: ASSETS[a].short.toLowerCase() }}
                    search={{ d }}
                    className="adm-btn"
                  >
                    {d === 5 ? "5 min" : d === 60 ? "1H" : "24H"}
                  </Link>
                ))}
              </div>
            ))}
          </div>
          <p className="adm-muted">
            Price cards are not evidence that trading is enabled. Manage supported pool series in
            Crypto Up/Down.
          </p>
        </Card>
      )}
      <Card title={`${page} · ${rows.length} sports listings`} flush>
        {native.isPending || events.isPending ? (
          <p className="adm-card-body">Loading…</p>
        ) : native.isError || events.isError || native.data?.error ? (
          <p className="adm-card-body">
            Some listing data is unavailable. Refresh before relying on counts.
          </p>
        ) : null}
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Sport</th>
                <th>Prediction</th>
                <th>State</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{marketSection(m)}</td>
                  <td>
                    <span className="adm-public-title">
                      <MarketIcon market={m} className="adm-public-icon" />
                      {m.title}
                    </span>
                  </td>
                  <td>{m.native?.status ?? "Listing pending"}</td>
                  <td>
                    <Link to="/markets/$marketId" params={{ marketId: m.id }}>
                      View ↗
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && !native.isPending && !events.isPending && (
          <p className="adm-card-body adm-muted">No listings for this tab.</p>
        )}
      </Card>
    </div>
  );
}
