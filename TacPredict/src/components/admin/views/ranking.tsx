import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { adminRankingOptions } from "@/lib/ranking/read.functions";
import { signedMoney, unsignedMoney, type RankingPeriod } from "@/lib/ranking/core.mjs";
import { PixelAvatar } from "@/components/pixel-avatar";
import { PageHeader, Card, Loaded, Notice } from "../admin-ui";
export function RankingView() {
  const [period, setPeriod] = useState<RankingPeriod>("30d"),
    q = useQuery(adminRankingOptions(period));
  return (
    <div className="adm-stack">
      <PageHeader
        title="Ranking"
        subtitle="Read-only finalized Base trader performance. Scores cannot be edited."
        actions={
          <>
            <select
              className="adm-input"
              aria-label="Ranking period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as RankingPeriod)}
            >
              <option value="1d">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="all">All time</option>
            </select>
            <button className="adm-btn" disabled={q.isFetching} onClick={() => void q.refetch()}>
              Refresh
            </button>
            <Link to="/ranking" className="adm-btn">
              Public Ranking ↗
            </Link>
          </>
        }
      />
      <Notice>
        Ranked by settled-market P&L, excluding gas and open-market marks. Volume is finalized
        exchange execution volume, not deposits. Unexplained transfers are unranked. Only public
        wallet aliases are shown; no account identity is published.
      </Notice>
      <Loaded query={q} label="ranking">
        {(data) => (
          <Card title={`Ranking · ${data.total} traders`}>
            <div style={{ overflowX: "auto" }}>
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Trader</th>
                    <th>Volume · USDC</th>
                    <th>Settled P&L · USDC</th>
                    <th>Markets</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((t) => (
                    <tr key={t.wallet}>
                      <td>{t.rank ?? "—"}</td>
                      <td>
                        <Link
                          to="/ranking"
                          search={{ period, trader: t.wallet }}
                          style={{ display: "flex", alignItems: "center", gap: 10 }}
                        >
                          <PixelAvatar seed={t.wallet} size={30} />
                          {t.name}
                        </Link>
                      </td>
                      <td>{unsignedMoney(t.volumeAtomic)}</td>
                      <td>{signedMoney(t.pnlAtomic)}</td>
                      <td>{t.markets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.rows.length && <p className="adm-muted">No finalized trader activity yet.</p>}
            </div>
            <p className="adm-muted" style={{ marginTop: 16 }}>
              First 50 traders. Open Public Ranking for pagination and trader details. Checkpoint:{" "}
              {new Date(data.observedAt).toLocaleString()}.
            </p>
          </Card>
        )}
      </Loaded>
    </div>
  );
}
