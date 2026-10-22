import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, Notice } from "../admin-ui";
import { poolConfigQueryOptions, poolHistoryQueryOptions } from "@/lib/pool/pool.functions";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import {
  ASSETS,
  DURATIONS,
  durationLabel,
  formatUsd,
  matchNativeMarket,
  slugOf,
  type UpDownAsset,
} from "@/lib/updown/window.mjs";
import { useNow } from "@/lib/updown/use-clock";
import { historyState, historyWindows } from "@/lib/updown/round-history.mjs";
import { fromScaled } from "@/lib/pool/pool.mjs";

const utc = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(ms);

export function RoundHistory({ asset }: { asset: UpDownAsset }) {
  const now = useNow(0);
  const [minutes, setMinutes] = useState(5);
  const [date, setDate] = useState("");
  const [page, setPage] = useState(0);
  const config = useQuery(poolConfigQueryOptions);
  const feed = useQuery(nativeMarketFeedQueryOptions);
  const size = minutes * 60000;
  const anchor = date
    ? Math.min(Math.floor(now / size) * size, Date.parse(date + "T23:59:59.999Z"))
    : Math.floor(now / size) * size;
  const before = anchor - page * 8 * size;
  const windows = useMemo(
    () => (now ? historyWindows(now, minutes, before) : []),
    [now, minutes, before],
  );
  const history = useQuery(
    poolHistoryQueryOptions(
      asset,
      minutes,
      Math.max(1, before),
      Boolean(now && config.data?.address),
    ),
  );
  return (
    <Card title={`${ASSETS[asset].short} · Time history`} flush>
      <div
        className="adm-card-body"
        style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}
      >
        <label className="adm-field">
          Length
          <select
            className="adm-select"
            value={minutes}
            onChange={(e) => {
              setMinutes(Number(e.target.value));
              setPage(0);
            }}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {durationLabel(d)}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          Date (UTC)
          <input
            type="date"
            className="adm-input"
            value={date}
            max={now ? new Date(now).toISOString().slice(0, 10) : undefined}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <button
          className="adm-btn"
          type="button"
          onClick={() => {
            setDate("");
            setPage(0);
          }}
        >
          Now
        </button>
        <button className="adm-btn" type="button" onClick={() => setPage((p) => p + 1)}>
          Earlier
        </button>
        <button
          className="adm-btn"
          type="button"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Later
        </button>
      </div>
      {history.isError && <Notice tone="warn">Round history could not be read. Try again.</Notice>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Start · UTC</th>
              <th>End · UTC</th>
              <th>State</th>
              <th>Start price</th>
              <th>End price</th>
            </tr>
          </thead>
          <tbody>
            {windows.map((w) => {
              const stored = history.data?.rows.find((r) => r.start === w.start);
              const round = stored?.round ?? null;
              const market = matchNativeMarket(feed.data?.markets, asset, w);
              const failed = stored && "readError" in stored && stored.readError;
              const status = config.data?.address
                ? history.isPending
                  ? "Loading…"
                  : history.isError || failed
                    ? "Read failed"
                    : historyState(round, w, now)
                : config.isPending || feed.isPending
                  ? "Loading…"
                  : config.isError || feed.isError
                    ? "Read failed"
                    : (market?.native?.status ?? "Schedule only");
              return (
                <tr key={w.start}>
                  <td>
                    {w.start >= Math.floor(now / size) * size - Math.max(86400000, 3 * size) ? (
                      <Link
                        className="adm-link"
                        to="/up-down/$asset"
                        params={{ asset: slugOf(asset) }}
                        search={{ d: minutes, w: w.start }}
                      >
                        {utc(w.start)}
                      </Link>
                    ) : (
                      <span>{utc(w.start)}</span>
                    )}
                  </td>
                  <td>{utc(w.end)}</td>
                  <td>{status}</td>
                  <td>
                    {round && BigInt(round.startPrice) > 0n
                      ? formatUsd(fromScaled(round.startPrice), asset)
                      : "—"}
                  </td>
                  <td>
                    {round && BigInt(round.endPrice) > 0n
                      ? formatUsd(fromScaled(round.endPrice), asset)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="adm-muted" style={{ padding: "12px 18px", fontSize: 12 }}>
        UTC-aligned windows.{" "}
        {history.data?.blockNumber
          ? `Finalized block ${history.data.blockNumber}.`
          : "A scheduled time is not a created or settled market."}
      </p>
    </Card>
  );
}
