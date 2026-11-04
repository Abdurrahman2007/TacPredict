import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { rankingOptions } from "@/lib/ranking/read.functions";
import {
  signedMoney,
  unsignedMoney,
  isWallet,
  traderName,
} from "@/lib/ranking/core.mjs";
import type { RankingTrader } from "@/lib/ranking/core.d.mts";
import { InitialAvatar } from "@/components/initial-avatar";
import {
  demoTrader,
  isDemoTrader,
  withDemoRankingRows,
} from "@/lib/ranking/demo-traders";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import "@/styles/ranking.css";
import "@/styles/ranking-board.css";

export const Route = createFileRoute("/ranking")({
  head: () => ({ meta: [{ title: "Ranking — TacPredict" }] }),
  validateSearch: (
    s: Record<string, unknown>,
  ): { trader?: string; page?: number } => ({
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
    rankingOptions({ period: "month", page, trader: s.trader, wallet: wallet.address?.toLowerCase() }),
  );
  const data = q.data;
  const [tab, setTab] = useState<"positions" | "activity">("positions");
  const countdown = useMonthCountdown();
  const liveRows = data?.rows ?? [];
  const rows = withDemoRankingRows(liveRows);
  const selected: RankingTrader | null | undefined = s.trader
    ? isDemoTrader(s.trader)
      ? demoTrader(s.trader)
      : data?.selected
    : null;
  const podium = s.trader ? [] : rows.slice(0, 3);
  const rest = s.trader ? [] : rows.slice(3);

  return (
    <section className="tp-lb" aria-labelledby="ranking-title">
      <header className="tp-lb-head">
        <div>
          {s.trader ? (
            <Link to="/ranking" className="tp-lb-back">
              <ArrowLeft size={14} /> Leaderboard
            </Link>
          ) : null}
          <h1 id="ranking-title">
            {s.trader ? (selected?.name ?? traderName(s.trader)) : "Ranking"}
          </h1>
        </div>
      </header>

      {!s.trader ? (
        <aside className="tp-lb-pool" aria-label="Monthly reward pool">
          <div>
            <span className="tp-lb-pool-kicker">Monthly pool · {monthLabel()}</span>
            <strong>
              {MONTHLY_TAC_POOL.toLocaleString("en-US")} <em>TAC</em>
            </strong>
            <div className="tp-lb-countdown">Resets in {countdown}</div>
          </div>
          <div className="tp-lb-pool-badge" aria-hidden="true">
            <Trophy size={26} aria-hidden="true" />
            <span>200K</span>
          </div>
        </aside>
      ) : null}

      {q.isPending && !s.trader ? (
        <p className="tp-lb-empty" role="status">
          Loading ranking…
        </p>
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
                <small>{s.trader.slice(0, 6)}…{s.trader.slice(-4)}</small>
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
                    <strong>
                      {(BigInt(p.sharesAtomic) / 1000000n).toLocaleString()} shares
                    </strong>
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
          {wallet.address && (
            <Link
              to="/ranking"
              search={{ trader: wallet.address.toLowerCase() }}
              className="tp-lb-self"
            >
              <span className="tp-lb-rank">{data?.self?.rank ?? "—"}</span>
              <InitialAvatar seed={wallet.address} size={40} label="You" />
              <span className="tp-lb-who">
                <strong>You</strong>
              </span>
              <span className="tp-lb-money">
                <span>{data?.self ? unsignedMoney(data.self.volumeAtomic) : "—"}</span>
                <small className={data?.self ? pnlClass(data.self.pnlAtomic) : ""}>
                  {data?.self ? signedMoney(data.self.pnlAtomic) : "—"}
                </small>
              </span>
            </Link>
          )}

          {podium.length > 0 ? (
            <div className="tp-lb-podium" aria-label="Top 3 traders">
              {podium.map((t) => (
                <Link
                  to="/ranking"
                  search={{ trader: t.wallet }}
                  key={t.wallet}
                  className={`tp-lb-podium-card rank-${t.rank ?? 0}`}
                >
                  <span className="tp-lb-medal">{t.rank ?? "—"}</span>
                  <InitialAvatar seed={t.wallet} size={t.rank === 1 ? 48 : 40} label={t.name} />
                  <strong>{t.name}</strong>
                  <span className="tp-lb-podium-vol">{unsignedMoney(t.volumeAtomic)}</span>
                  <span className={`tp-lb-pnl ${pnlClass(t.pnlAtomic)}`}>
                    {signedMoney(t.pnlAtomic)}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}

          <div className="tp-lb-list">
            {rest.map((t) => (
              <Link
                to="/ranking"
                search={{ trader: t.wallet }}
                key={t.wallet}
                className="tp-lb-row"
              >
                <span className="tp-lb-rank">{t.rank ?? "—"}</span>
                <InitialAvatar seed={t.wallet} size={40} label={t.name} />
                <span className="tp-lb-who">
                  <strong>{t.name}</strong>
                </span>
                <span className="tp-lb-money">
                  <span>{unsignedMoney(t.volumeAtomic)}</span>
                  <small className={pnlClass(t.pnlAtomic)}>{signedMoney(t.pnlAtomic)}</small>
                </span>
              </Link>
            ))}
          </div>

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
