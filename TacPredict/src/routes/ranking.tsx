import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Crown, Trophy } from "lucide-react";
import { rankingOptions } from "@/lib/ranking/read.functions";
import { signedMoney, unsignedMoney, isWallet, traderName } from "@/lib/ranking/core.mjs";
import type { RankingTrader } from "@/lib/ranking/core.d.mts";
import { InitialAvatar } from "@/components/initial-avatar";
import { demoTrader, isDemoTrader, withDemoRankingRows } from "@/lib/ranking/demo-traders";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import "@/styles/ranking.css";
import "@/styles/ranking-board.css";
import "@/styles/ranking-v2.css";

export const Route = createFileRoute("/ranking")({
  head: () => ({ meta: [{ title: "Ranking — TacPredict" }] }),
  validateSearch: (s: Record<string, unknown>): { trader?: string; page?: number } => ({
    ...(isWallet(s["trader"]) ? { trader: s["trader"].toLowerCase() } : {}),
    page:
      Number.isInteger(Number(s["page"])) && Number(s["page"]) >= 0 && Number(s["page"]) <= 399
        ? Number(s["page"])
        : 0,
  }),
  component: RankingPage,
});

/** Monthly leaderboard: current calendar month only, no period tabs. */
const MONTHLY_TAC_POOL = 200_000;
const subscribeHydration = () => () => {};

function monthLabel(d = new Date()) {
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

/** Time left until the next calendar month starts (UTC). */
function monthCountdown(now: number) {
  const d = new Date(now);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const diff = Math.max(0, end - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return days > 0
    ? `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
    : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function useMonthCountdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return monthCountdown(now);
}

function monthParts(now: number) {
  const d = new Date(now);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const diff = Math.max(0, end - now);
  return [
    ["Days", Math.floor(diff / 86400000)],
    ["Hrs", Math.floor((diff % 86400000) / 3600000)],
    ["Min", Math.floor((diff % 3600000) / 60000)],
    ["Sec", Math.floor((diff % 60000) / 1000)],
  ] as const;
}

function useNowTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const PLACES = ["1st", "2nd", "3rd"] as const;

function atomic(v: string | null | undefined) {
  try {
    return v == null ? 0n : BigInt(v);
  } catch {
    return 0n;
  }
}

function RankingPage() {
  const ready = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  return ready ? (
    <RankingClient />
  ) : (
    <section className="tp-lb" aria-busy="true" aria-label="Loading ranking">
      <h1 className="sr-only">Ranking</h1>
    </section>
  );
}

function pnlClass(v: string | null | undefined) {
  if (v === null || v === undefined) return "";
  const n = BigInt(v);
  return n > 0n ? "positive" : n < 0n ? "negative" : "";
}

function RankingClient() {
  const s = Route.useSearch(),
    page = s.page ?? 0,
    navigate = Route.useNavigate(),
    wallet = useBaseWallet();
  const q = useQuery(
    rankingOptions({
      period: "month",
      page,
      trader: s.trader,
      wallet: wallet.address?.toLowerCase(),
    }),
  );
  const data = q.data;
  const [tab, setTab] = useState<"positions" | "activity">("positions");
  const countdown = useMonthCountdown();
  const now = useNowTick();
  const [metric, setMetric] = useState<"volume" | "pnl">("volume");
  const liveRows = data?.rows ?? [];
  const rows = withDemoRankingRows(liveRows);
  const selected: RankingTrader | null | undefined = s.trader
    ? isDemoTrader(s.trader)
      ? demoTrader(s.trader)
      : data?.selected
    : null;
  const sorted =
    metric === "volume"
      ? rows
      : [...rows].sort((x, y) => {
          const d = atomic(y.pnlAtomic) - atomic(x.pnlAtomic);
          return d > 0n ? 1 : d < 0n ? -1 : 0;
        });
  const ranked = sorted.map((t, i) => ({
    ...t,
    place: metric === "volume" ? (t.rank ?? i + 1) : i + 1,
  }));
  const podium = s.trader ? [] : ranked.slice(0, 3);
  const rest = s.trader ? [] : ranked.slice(3);
  const top = atomic((metric === "volume" ? ranked[0]?.volumeAtomic : ranked[0]?.pnlAtomic) ?? "0");

  return (
    <section className="tp-lb tp-rk" aria-labelledby="ranking-title">
      <header className="tp-rk-head">
        <div>
          {s.trader ? (
            <Link to="/ranking" className="tp-lb-back">
              <ArrowLeft size={14} /> Leaderboard
            </Link>
          ) : (
            <span className="tp-rk-kicker">{monthLabel()}</span>
          )}
          <h1 id="ranking-title">
            {s.trader ? (selected?.name ?? traderName(s.trader)) : "Leaderboard"}
          </h1>
        </div>
        {!s.trader ? (
          <span className="tp-rk-trophy" aria-hidden="true">
            <Trophy size={22} />
          </span>
        ) : null}
      </header>

      {!s.trader ? (
        <aside className="tp-rk-pool" aria-label="Monthly reward pool">
          <i className="tp-rk-shine" aria-hidden />
          <span className="tp-rk-pool-label">Monthly prize pool</span>
          <strong className="tp-rk-pool-amt">
            {MONTHLY_TAC_POOL.toLocaleString("en-US")} <em>TAC</em>
          </strong>
          <div className="tp-rk-timer" role="timer" aria-label={`Resets in ${countdown}`}>
            {monthParts(now).map(([label, value]) => (
              <span key={label}>
                <b>{String(value).padStart(2, "0")}</b>
                <small>{label}</small>
              </span>
            ))}
          </div>
          <p className="tp-rk-pool-note">Points only · Ranked by monthly volume</p>
        </aside>
      ) : null}

      {q.isPending && !s.trader ? (
        <div className="tp-rk-loading" role="status" aria-label="Loading ranking">
          <div className="tp-skel" style={{ height: 210, borderRadius: 24 }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="tp-skel" style={{ height: 64, borderRadius: 18 }} />
          ))}
        </div>
      ) : s.trader ? (
        <>
          <div className="tp-lb-hero">
            <InitialAvatar seed={s.trader} size={72} label={selected?.name} />
            <div>
              <strong>{selected?.name ?? traderName(s.trader)}</strong>
              {!isDemoTrader(s.trader) ? (
                <small>
                  <a
                    href={`https://basescan.org/address/${s.trader}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.trader.slice(0, 6)}…{s.trader.slice(-4)} ↗
                  </a>
                </small>
              ) : (
                <small>
                  {s.trader.slice(0, 6)}…{s.trader.slice(-4)}
                </small>
              )}
            </div>
          </div>
          <div className="tp-lb-stats">
            {[
              ["Rank", selected?.rank ?? "—"],
              ["Volume", selected ? unsignedMoney(selected.volumeAtomic) : "—"],
              ["Settled P&L", selected ? signedMoney(selected.pnlAtomic) : "—"],
              ["Markets", selected?.markets ?? "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong className={label === "Settled P&L" ? pnlClass(selected?.pnlAtomic) : ""}>
                  {value}
                </strong>
              </div>
            ))}
          </div>
          <div className="tp-lb-seg tp-lb-tabs" role="group" aria-label="Trader data">
            <button
              type="button"
              className={tab === "positions" ? "on" : undefined}
              aria-pressed={tab === "positions"}
              onClick={() => setTab("positions")}
            >
              Positions
            </button>
            <button
              type="button"
              className={tab === "activity" ? "on" : undefined}
              aria-pressed={tab === "activity"}
              onClick={() => setTab("activity")}
            >
              Activity
            </button>
          </div>
          {tab === "positions" ? (
            selected?.positions.length ? (
              <div className="tp-lb-list">
                {selected.positions.map((p, i) => (
                  <div key={`${p.marketId}-${p.outcome}-${i}`} className="tp-lb-record">
                    <span>
                      <strong>{p.title}</strong>
                      <small>{p.settled ? "Settled" : "Open"}</small>
                    </span>
                    <strong>{(BigInt(p.sharesAtomic) / 1000000n).toLocaleString()} shares</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="tp-lb-empty">
                <p>{selected ? "No positions" : "No finalized activity for this period"}</p>
              </div>
            )
          ) : selected?.activity.length ? (
            <div className="tp-lb-list">
              {selected.activity.map((a) => (
                <div key={a.id} className="tp-lb-record">
                  <span>
                    <strong>{a.title}</strong>
                    <small>{a.side}</small>
                  </span>
                  <strong>{unsignedMoney(a.amountAtomic)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="tp-lb-empty">No trades for this period</p>
          )}
        </>
      ) : (
        <>
          <div className="tp-seg tp-rk-seg" role="tablist" aria-label="Rank by">
            {(["volume", "pnl"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={metric === m}
                className={metric === m ? "on" : undefined}
                onClick={() => setMetric(m)}
              >
                {m === "volume" ? "Volume" : "Profit"}
              </button>
            ))}
            <i className="tp-seg-thumb" data-pos={metric === "volume" ? 0 : 1} aria-hidden />
          </div>

          {podium.length > 0 ? (
            <div className="tp-rk-podium" aria-label="Top 3 traders" key={metric}>
              {[podium[1], podium[0], podium[2]].map((t, i) =>
                t ? (
                  <Link
                    to="/ranking"
                    search={{ trader: t.wallet }}
                    key={t.wallet}
                    className={`tp-rk-step place-${t.place}`}
                    style={{ ["--d" as string]: `${[1, 0, 2][i]! * 90}ms` }}
                  >
                    <span className="tp-rk-avatar">
                      {t.place === 1 ? (
                        <Crown className="tp-rk-crown" size={22} aria-hidden />
                      ) : null}
                      <InitialAvatar
                        seed={t.wallet}
                        size={t.place === 1 ? 64 : 52}
                        label={t.name}
                      />
                      <span className="tp-rk-badge">{t.place}</span>
                    </span>
                    <strong>{t.name}</strong>
                    <span className="tp-rk-val">
                      {metric === "volume"
                        ? unsignedMoney(t.volumeAtomic)
                        : signedMoney(t.pnlAtomic)}
                    </span>
                    <span className="tp-rk-block">
                      <b>{t.place}</b>
                      <small>{PLACES[(t.place ?? 1) - 1] ?? ""}</small>
                    </span>
                  </Link>
                ) : (
                  <span key={i} />
                ),
              )}
            </div>
          ) : null}

          <ol className="tp-rk-list" key={`list-${metric}`}>
            {rest.map((t, i) => {
              const v = atomic(metric === "volume" ? t.volumeAtomic : t.pnlAtomic);
              const pct =
                top > 0n && v > 0n ? Math.max(4, Math.min(100, Number((v * 100n) / top))) : 4;
              return (
                <li key={t.wallet} style={{ ["--d" as string]: `${Math.min(i, 10) * 35}ms` }}>
                  <Link to="/ranking" search={{ trader: t.wallet }} className="tp-rk-row">
                    <span className="tp-rk-num">{t.place}</span>
                    <InitialAvatar seed={t.wallet} size={40} label={t.name} />
                    <span className="tp-rk-who">
                      <strong>{t.name}</strong>
                      <span className="tp-rk-bar" aria-hidden>
                        <i style={{ transform: `scaleX(${pct / 100})` }} />
                      </span>
                    </span>
                    <span className="tp-rk-money">
                      <b>{unsignedMoney(t.volumeAtomic)}</b>
                      <small className={pnlClass(t.pnlAtomic)}>{signedMoney(t.pnlAtomic)}</small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>

          {wallet.address && data?.self ? (
            <Link
              to="/ranking"
              search={{ trader: wallet.address.toLowerCase() }}
              className="tp-rk-you"
            >
              <span className="tp-rk-num">{data.self.rank ?? "—"}</span>
              <InitialAvatar seed={wallet.address} size={40} label="You" />
              <span className="tp-rk-who">
                <strong>You</strong>
                <small>Keep trading to climb</small>
              </span>
              <span className="tp-rk-money">
                <b>{unsignedMoney(data.self.volumeAtomic)}</b>
                <small className={pnlClass(data.self.pnlAtomic)}>
                  {signedMoney(data.self.pnlAtomic)}
                </small>
              </span>
            </Link>
          ) : null}

          {data && data.total > 0 && (
            <nav className="tp-lb-paging" aria-label="Ranking pages">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => void navigate({ search: { page: page - 1 } })}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <span>{page + 1}</span>
              <button
                type="button"
                disabled={(page + 1) * 50 >= data.total}
                onClick={() => void navigate({ search: { page: page + 1 } })}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
