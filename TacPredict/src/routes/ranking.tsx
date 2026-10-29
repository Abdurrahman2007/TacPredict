import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { rankingOptions } from "@/lib/ranking/read.functions";
import {
  signedMoney,
  unsignedMoney,
  isWallet,
  traderName,
  type RankingPeriod,
} from "@/lib/ranking/core.mjs";
import type { RankingTrader } from "@/lib/ranking/core.d.mts";
import {
  demoTrader,
  isDemoTrader,
  withDemoRankingRows,
} from "@/lib/ranking/demo-traders";
import { PixelAvatar } from "@/components/pixel-avatar";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import "@/styles/ranking.css";
import "@/styles/ranking-board.css";

export const Route = createFileRoute("/ranking")({
  head: () => ({ meta: [{ title: "Ranking — TacPredict" }] }),
  validateSearch: (
    s: Record<string, unknown>,
  ): { period?: RankingPeriod; trader?: string; page?: number } => ({
    period: ["1d", "7d", "30d", "all"].includes(String(s["period"]))
      ? (s["period"] as RankingPeriod)
      : "30d",
    ...(isWallet(s["trader"]) ? { trader: s["trader"].toLowerCase() } : {}),
    page:
      Number.isInteger(Number(s["page"])) && Number(s["page"]) >= 0 && Number(s["page"]) <= 399
        ? Number(s["page"])
        : 0,
  }),
  component: RankingPage,
});

const periodNames = { "1d": "24h", "7d": "7d", "30d": "30d", all: "All" };
/** This month’s ranking reward pool (TAC points). */
const MONTHLY_TAC_POOL = 200_000;
const subscribeHydration = () => () => {};

function monthLabel(d = new Date()) {
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
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
    <section className="tp-rank-board" aria-busy="true" aria-label="Loading ranking">
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
    period = s.period ?? "30d",
    page = s.page ?? 0,
    navigate = Route.useNavigate(),
    wallet = useBaseWallet();
  const q = useQuery(
    rankingOptions({ period, page, trader: s.trader, wallet: wallet.address?.toLowerCase() }),
  );
  const data = q.data;
  const [tab, setTab] = useState<"positions" | "activity">("positions");
  const liveRows = data?.rows ?? [];
  const rows = withDemoRankingRows(liveRows);
  const demoBoard = liveRows.length === 0;
  const selected: RankingTrader | null | undefined = s.trader
    ? isDemoTrader(s.trader)
      ? demoTrader(s.trader)
      : data?.selected
    : null;

  return (
    <section className="tp-rank-board" aria-labelledby="ranking-title">
      <Link to="/" className="tp-rank-back">
        <ArrowLeft size={14} /> Home
      </Link>
      <header className="tp-rank-top">
        <div>
          {s.trader ? (
            <Link to="/ranking" search={{ period }} className="tp-rank-back">
              <ArrowLeft size={14} /> Leaderboard
            </Link>
          ) : null}
          <h1 id="ranking-title">
            {s.trader ? (selected?.name ?? traderName(s.trader)) : "Ranking"}
          </h1>
        </div>
        <div className="tp-rank-seg" role="group" aria-label="Ranking period">
          {(Object.keys(periodNames) as RankingPeriod[]).map((v) => (
            <button
              key={v}
              type="button"
              className={period === v ? "on" : undefined}
              aria-pressed={period === v}
              onClick={() => void navigate({ search: { ...s, period: v, page: 0 } })}
            >
              {periodNames[v]}
            </button>
          ))}
        </div>
      </header>

      {!s.trader ? (
        <aside className="tp-rank-pool" aria-label="Monthly reward pool">
          <div className="tp-rank-pool-copy">
            <span className="tp-rank-pool-kicker">{monthLabel()}</span>
            <strong>
              {MONTHLY_TAC_POOL.toLocaleString("en-US")} <em>TAC</em>
            </strong>
          </div>
          <div className="tp-rank-pool-badge" aria-hidden="true">
            <span>200K</span>
            <small>TAC</small>
          </div>
        </aside>
      ) : null}

      {q.isPending && !demoBoard && !s.trader ? (
        <p className="tp-rank-empty" role="status">
          Loading ranking…
        </p>
      ) : s.trader ? (
        <>
          <div className="tp-rank-who" style={{ marginBottom: 16 }}>
            <PixelAvatar seed={s.trader} size={56} />
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
                <small>Demo trader</small>
              )}
            </div>
          </div>
          <div className="tp-rank-stats">
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
          <div className="tp-rank-tabs" role="group" aria-label="Trader data">
            <button
              type="button"
              aria-pressed={tab === "positions"}
              onClick={() => setTab("positions")}
            >
              Positions
            </button>
            <button
              type="button"
              aria-pressed={tab === "activity"}
              onClick={() => setTab("activity")}
            >
              Activity
            </button>
          </div>
          {tab === "positions" ? (
            selected?.positions.length ? (
              <div>
                {selected.positions.map((p, i) => (
                  <div key={`${p.marketId}-${p.outcome}-${i}`} className="tp-rank-record">
                    <span>
                      <strong>{p.title}</strong>
                      <small>
                        Outcome {p.outcome + 1} · {p.settled ? "Settled" : "Open"}
                      </small>
                    </span>
                    <strong>
                      {(BigInt(p.sharesAtomic) / 1000000n).toLocaleString()} shares
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="tp-rank-empty">
                <p>{selected ? "No positions" : "No finalized activity for this period"}</p>
              </div>
            )
          ) : selected?.activity.length ? (
            <div>
              {selected.activity.map((a) => (
                <div key={a.id} className="tp-rank-record">
                  <span>
                    <strong>{a.title}</strong>
                    <small>
                      {a.side} ·{" "}
                      {new Date(a.timestamp).toISOString().slice(0, 19).replace("T", " ") + " UTC"}
                    </small>
                  </span>
                  <strong>{unsignedMoney(a.amountAtomic)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="tp-rank-empty">No trades for this period</p>
          )}
        </>
      ) : (
        <>
          {wallet.address && (
            <Link
              to="/ranking"
              search={{ period, trader: wallet.address.toLowerCase() }}
              className="tp-rank-row self"
            >
              <span className="tp-rank-num">{data?.self?.rank ?? "—"}</span>
              <span className="tp-rank-who">
                <PixelAvatar seed={wallet.address} />
                <span>
                  <strong>You</strong>
                  <small>{traderName(wallet.address)}</small>
                </span>
              </span>
              <span className="tp-rank-money">
                <span>{data?.self ? unsignedMoney(data.self.volumeAtomic) : "—"}</span>
                <small>{data?.self ? signedMoney(data.self.pnlAtomic) : "—"}</small>
              </span>
            </Link>
          )}
          <div className="tp-rank-cols" aria-hidden="true">
            <span>#</span>
            <span>Trader</span>
            <span>Vol / P&amp;L</span>
          </div>
          <div>
            {rows.map((t) => (
              <Link
                to="/ranking"
                search={{ period, trader: t.wallet }}
                key={t.wallet}
                className="tp-rank-row"
              >
                <span
                  className="tp-rank-num"
                  data-medal={t.rank && t.rank <= 3 ? t.rank : undefined}
                >
                  {t.rank ?? "—"}
                </span>
                <span className="tp-rank-who">
                  <PixelAvatar seed={t.wallet} />
                  <span>
                    <strong>{t.name}</strong>
                    <small>
                      {t.markets} markets · {t.settledMarkets} settled
                    </small>
                  </span>
                </span>
                <span className="tp-rank-money">
                  <span>{unsignedMoney(t.volumeAtomic)}</span>
                  <small className={pnlClass(t.pnlAtomic)}>{signedMoney(t.pnlAtomic)}</small>
                </span>
              </Link>
            ))}
          </div>
          {!demoBoard && data && (
            <nav className="ranking-paging" aria-label="Ranking pages">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => void navigate({ search: { period, page: page - 1 } })}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <span>{page + 1}</span>
              <button
                type="button"
                disabled={(page + 1) * 50 >= data.total}
                onClick={() => void navigate({ search: { period, page: page + 1 } })}
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
