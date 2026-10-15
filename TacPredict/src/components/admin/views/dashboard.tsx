import { Link } from "@tanstack/react-router";
import { atomicToDecimal, formatTimestamp } from "@/lib/protocol/admin-rows.mjs";
import { useAdminSnapshot, useLiveChain } from "../admin-data";
import { Badge, Card, Loaded, Notice, PageHeader, Tile } from "../admin-ui";

function leadingCount(detail: string): string | null {
  const match = /^(\d+)\b/.exec(detail);
  return match?.[1] ?? null;
}

export function DashboardView() {
  const query = useAdminSnapshot("Dashboard");
  const live = useLiveChain();
  return (
    <div className="adm-stack">
      <PageHeader
        title="Dashboard"
        subtitle="Real indexed and on-chain state for TacPredict on Base Mainnet. Nothing here is estimated."
      />
      <Loaded query={query} label="dashboard">
        {(snapshot) => {
          const byId = Object.fromEntries(snapshot.rows.map((r) => [r.id, r]));
          const markets = byId["markets"];
          const open = byId["open"];
          const volume = byId["volume"];
          const job = byId["last-job"];
          const volumeText = volume ? atomicToDecimal(volume.usdcAtoms) : null;
          return (
            <div className="adm-grid-tiles">
              <Tile
                label="Indexed markets"
                value={markets ? (leadingCount(markets.detail) ?? "Unavailable") : "Unavailable"}
                hint="Base Mainnet"
              />
              <Tile
                label="Open markets"
                value={open ? (leadingCount(open.detail) ?? "Unavailable") : "Unavailable"}
                hint="Indexed OPEN state; time and pause still apply"
              />
              <Tile
                label="Finalized volume"
                value={volumeText === null ? "Unavailable" : `${volumeText} USDC`}
                hint="Indexed Exchange executions only"
              />
              <Tile
                label="Latest indexer job"
                value={job ? job.detail : "Unavailable"}
                hint={job?.observedAt ? (formatTimestamp(job.observedAt) ?? undefined) : undefined}
              />
            </div>
          );
        }}
      </Loaded>

      <Card
        title="Chain status"
        actions={
          <button
            type="button"
            className="adm-btn"
            disabled={live.isFetching}
            onClick={() => void live.refetch()}
          >
            {live.isFetching ? "Reading Base…" : "Refresh"}
          </button>
        }
      >
        <Loaded query={live} label="chain status">
          {(data) => (
            <dl className="adm-kv">
              <dt>Head block</dt>
              <dd>{data.blockNumber ?? "Unavailable"}</dd>
              <dt>Trading</dt>
              <dd>
                {data.tradingPaused === null ? (
                  "Unavailable"
                ) : data.tradingPaused ? (
                  <Badge tone="warn">Paused on-chain</Badge>
                ) : (
                  <Badge tone="ok">Not paused</Badge>
                )}
              </dd>
              <dt>Markets created</dt>
              <dd>{data.nextMarketId ?? "Unavailable"}</dd>
              <dt>Observed</dt>
              <dd>{formatTimestamp(data.observedAt) ?? data.observedAt}</dd>
            </dl>
          )}
        </Loaded>
      </Card>

      <div className="adm-two">
        <Card title="Common tasks">
          <div style={{ display: "grid", gap: 8 }}>
            <Link
              className="adm-link"
              to="/admin/$section"
              params={{ section: "markets" }}
              search={{ view: "create" }}
            >
              Create a market
            </Link>
            <Link
              className="adm-link"
              to="/admin/$section"
              params={{ section: "resolution" }}
              search={{ view: "pending" }}
            >
              Review pending resolutions
            </Link>
            <Link
              className="adm-link"
              to="/admin/$section"
              params={{ section: "blockchain" }}
              search={{ view: "indexer" }}
            >
              Check indexer lag
            </Link>
            <Link className="adm-link" to="/admin/market-importer">
              Review AI-imported market candidates
            </Link>
          </div>
        </Card>
        <Card title="Safety boundaries">
          <ul className="adm-muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>Balances and positions are Base contract truth and cannot be edited here.</li>
            <li>USDC only, on Base. No TAC Points in the prediction product.</li>
            <li>Contract actions need an authorized wallet signature.</li>
          </ul>
        </Card>
      </div>
      <Notice>
        Pages marked with a hollow dot in the sidebar have no data source yet. They say so instead of
        showing placeholder numbers.
      </Notice>
    </div>
  );
}
