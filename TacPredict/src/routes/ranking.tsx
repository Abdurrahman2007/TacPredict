import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { ArrowLeft, Trophy, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { rankingOptions } from "@/lib/ranking/read.functions";
import {
  signedMoney,
  unsignedMoney,
  isWallet,
  traderName,
  type RankingPeriod,
} from "@/lib/ranking/core.mjs";
import { PixelAvatar } from "@/components/pixel-avatar";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import "@/styles/ranking.css";
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
const periodNames = { "1d": "24 hours", "7d": "7 days", "30d": "30 days", all: "All time" };
const subscribeHydration = () => () => {};
function RankingPage() {
  const ready = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  return ready ? (
    <RankingClient />
  ) : (
    <section className="tp-ranking" aria-busy="true" aria-label="Loading ranking">
      <h1 className="sr-only">Ranking</h1>
    </section>
  );
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
  const data = q.data,
    [tab, setTab] = useState<"positions" | "activity">("positions");
  const selected = data?.selected;
  const unavailable = q.isError || data?.status === "unavailable";
  return (
    <section className="tp-ranking" aria-labelledby="ranking-title">
      <header className="ranking-header">
        <div>
          {s.trader && (
            <Link to="/ranking" search={{ period }} className="ranking-back">
              <ArrowLeft size={16} /> Ranking
            </Link>
          )}
          <h1 id="ranking-title" className={s.trader ? "sr-only" : undefined}>
            {s.trader ? (selected?.name ?? traderName(s.trader)) : "Ranking"}
          </h1>
        </div>
        <label>
          <span className="sr-only">Ranking period</span>
          <select
            value={period}
            onChange={(e) =>
              void navigate({ search: { ...s, period: e.target.value as RankingPeriod, page: 0 } })
            }
          >
            {Object.entries(periodNames).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </header>
      {q.isPending ? (
        <p className="ranking-empty" role="status">
          Loading ranking…
        </p>
      ) : unavailable ? (
        <div className="ranking-empty" role="status">
          <Trophy />
          <h2>Ranking is temporarily unavailable</h2>
          <p>Finalized activity could not be verified.</p>
          <button onClick={() => void q.refetch()}>
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      ) : s.trader ? (
        <>
          <div className="trader-identity">
            <PixelAvatar seed={s.trader} size={64} />
            <div>
              <strong>{selected?.name ?? traderName(s.trader)}</strong>
              <a
                href={`https://basescan.org/address/${s.trader}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {s.trader.slice(0, 6)}…{s.trader.slice(-4)} ↗
              </a>
            </div>
          </div>
          <div className="ranking-stats">
            {[
              ["Rank", selected?.rank ?? "—"],
              ["Volume", selected ? unsignedMoney(selected.volumeAtomic) : "—"],
              ["Settled P&L", selected ? signedMoney(selected.pnlAtomic) : "—"],
              ["Markets", selected?.markets ?? "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong
                  className={
                    label === "Settled P&L" &&
                    selected?.pnlAtomic !== null &&
                    selected?.pnlAtomic !== undefined
                      ? BigInt(selected.pnlAtomic) > 0n
                        ? "positive"
                        : BigInt(selected.pnlAtomic) < 0n
                          ? "negative"
                          : ""
                      : ""
                  }
                >
                  {value}
                </strong>
              </div>
            ))}
          </div>
          <div className="ranking-tabs" role="group" aria-label="Trader data">
            <button aria-pressed={tab === "positions"} onClick={() => setTab("positions")}>
              Positions
            </button>
            <button aria-pressed={tab === "activity"} onClick={() => setTab("activity")}>
              Activity
            </button>
          </div>
          {tab === "positions" ? (
            selected?.positions.length ? (
              <div className="ranking-records">
                {selected.positions.map((p, i) => (
                  <Link
                    key={`${p.marketId}-${p.outcome}-${i}`}
                    to="/markets/$marketId"
                    params={{ marketId: p.marketId }}
                  >
                    <span>
                      {p.title}
                      <small>
                        Outcome {p.outcome + 1} · {p.settled ? "Settled" : "Open"}
                      </small>
                    </span>
                    <strong>
                      {(BigInt(p.sharesAtomic) / 1000000n).toLocaleString()}
                      {BigInt(p.sharesAtomic) % 1000000n
                        ? "." +
                          (BigInt(p.sharesAtomic) % 1000000n)
                            .toString()
                            .padStart(6, "0")
                            .replace(/0+$/, "")
                        : ""}{" "}
                      shares
                    </strong>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="ranking-empty">
                <p>{selected ? "No positions" : "No finalized activity for this period"}</p>
                <Link to="/markets">Explore Markets</Link>
              </div>
            )
          ) : selected?.activity.length ? (
            <div className="ranking-records">
              {selected.activity.map((a) => (
                <a
                  key={a.id}
                  href={`https://basescan.org/tx/${a.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>
                    {a.title}
                    <small>
                      {a.side} ·{" "}
                      {new Date(a.timestamp).toISOString().slice(0, 19).replace("T", " ") + " UTC"}
                    </small>
                  </span>
                  <strong>{unsignedMoney(a.amountAtomic)}</strong>
                </a>
              ))}
            </div>
          ) : (
            <p className="ranking-empty">No trades for this period</p>
          )}
        </>
      ) : (
        <>
          {wallet.address && (
            <Link
              to="/ranking"
              search={{ period, trader: wallet.address.toLowerCase() }}
              className="ranking-row ranking-self"
            >
              <span className="rank-number">{data?.self?.rank ?? "—"}</span>
              <PixelAvatar seed={wallet.address} />
              <span className="ranking-name">
                <strong>You</strong>
                <small>{traderName(wallet.address)}</small>
              </span>
              <span className="ranking-amounts">
                <span>{data?.self ? unsignedMoney(data.self.volumeAtomic) : "—"}</span>
                <small>{data?.self ? signedMoney(data.self.pnlAtomic) : "—"}</small>
              </span>
            </Link>
          )}
          {data?.rows.length ? (
            <>
              <div className="ranking-list-label">
                <span>Trader</span>
                <span>Volume / Settled P&L</span>
              </div>
              <div className="ranking-list">
                {data.rows.map((t) => (
                  <Link
                    to="/ranking"
                    search={{ period, trader: t.wallet }}
                    key={t.wallet}
                    className="ranking-row"
                  >
                    <span
                      className="rank-number"
                      data-medal={t.rank && t.rank <= 3 ? t.rank : undefined}
                    >
                      {t.rank ?? "—"}
                    </span>
                    <PixelAvatar seed={t.wallet} />
                    <span className="ranking-name">{t.name}</span>
                    <span className="ranking-amounts">
                      <span>{unsignedMoney(t.volumeAtomic)}</span>
                      <small
                        className={
                          t.pnlAtomic !== null
                            ? BigInt(t.pnlAtomic) > 0n
                              ? "positive"
                              : BigInt(t.pnlAtomic) < 0n
                                ? "negative"
                                : ""
                            : ""
                        }
                      >
                        {signedMoney(t.pnlAtomic)}
                      </small>
                    </span>
                  </Link>
                ))}
              </div>
              <nav className="ranking-paging" aria-label="Ranking pages">
                <button
                  disabled={page === 0}
                  onClick={() => void navigate({ search: { period, page: page - 1 } })}
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <span>{page + 1}</span>
                <button
                  disabled={(page + 1) * 50 >= data.total}
                  onClick={() => void navigate({ search: { period, page: page + 1 } })}
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </nav>
            </>
          ) : (
            <div className="ranking-empty">
              <Trophy />
              <h2>No finalized traders yet</h2>
              <p>Ranking appears after verified market activity.</p>
              <Link to="/">Explore live markets</Link>
            </div>
          )}
        </>
      )}
      <details className="ranking-method">
        <summary>How ranking works</summary>
        <p>
          Ranked by settled-market P&L for markets finalized in the selected period. Includes
          lifetime market cash flows and remaining settlement entitlements; excludes open-market
          marks, gas and off-platform costs. Volume counts each trader’s finalized exchange
          executions during the selected period, not deposits or rewards. Markets counts traded or
          settled markets in the period.
        </p>
        <p>
          Unexplained token transfers or incomplete cost basis are not ranked. A dash means no
          verified metric, not zero. Coverage is currently indexed Exchange markets; Up/Down pool
          rounds are not included. Only public onchain activity is shown; email, login identity,
          private orders and wallet cash balances are never published. Trader names and pixel
          avatars are generated automatically from the public wallet address. Positions show current
          holdings (up to 100); activity shows the latest 50 executions in the selected period.
          Metrics are in USDC.
        </p>
        {data?.observedAt && (
          <p>
            Finalized checkpoint:{" "}
            {new Date(data.observedAt).toISOString().slice(0, 19).replace("T", " ") + " UTC"}.
            Updates every minute.
          </p>
        )}
      </details>
    </section>
  );
}
