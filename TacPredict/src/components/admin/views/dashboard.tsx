import { Link } from "@tanstack/react-router";
import { atomicToDecimal, formatTimestamp } from "@/lib/protocol/admin-rows.mjs";
import { useAdminSnapshot, useLiveChain } from "../admin-data";
import { Badge, Card, Loaded, PageHeader, Tile } from "../admin-ui";

function leadingCount(detail: string | undefined): string {
  const match = detail ? /^(\d+)\b/.exec(detail) : null;
  return match?.[1] ?? "0";
}

function usdc(atomic: string | null | undefined): string {
  const text = atomicToDecimal(atomic ?? null);
  return text === null ? "$0" : `$${text.replace(/\.00$/, "")}`;
}

export function DashboardView() {
  const main = useAdminSnapshot("Dashboard");
  const volume = useAdminSnapshot("Analytics");
  const users = useAdminSnapshot("Users");
  const live = useLiveChain();

  return (
    <div className="adm-stack">
      <PageHeader
        title="Overview"
        subtitle="Live numbers for TacPredict on Base."
        actions={
          <>
            <Link
              className="adm-btn adm-btn-primary"
              to="/admin/$section"
              params={{ section: "markets" }}
              search={{ view: "create" }}
            >
              Create market
            </Link>
            <Link className="adm-btn" to="/admin/market-importer">
              AI importer
            </Link>
          </>
        }
      />

      <Loaded query={main} label="overview">
        {(snapshot) => {
          const byId = Object.fromEntries(snapshot.rows.map((r) => [r.id, r]));
          const day = volume.data?.rows.find((r) => r.id === "volume24");
          const accounts = users.data?.rows.find((r) => r.id === "users");
          return (
            <div className="adm-grid-tiles">
              <Tile label="Markets" value={leadingCount(byId["markets"]?.detail)} />
              <Tile label="Open now" value={leadingCount(byId["open"]?.detail)} />
              <Tile label="Total volume" value={usdc(byId["volume"]?.usdcAtoms)} hint="USDC traded" />
              <Tile label="Volume, 24 hours" value={usdc(day?.usdcAtoms)} hint="USDC traded" />
              <Tile label="Accounts" value={leadingCount(accounts?.detail)} />
              <Tile
                label="Indexer"
                value={byId["last-job"]?.detail ?? "No run yet"}
                hint={formatTimestamp(byId["last-job"]?.observedAt) ?? undefined}
              />
            </div>
          );
        }}
      </Loaded>

      <Card
        title="Base network"
        actions={
          <button
            type="button"
            className="adm-btn"
            disabled={live.isFetching}
            onClick={() => void live.refetch()}
          >
            {live.isFetching ? "Reading…" : "Refresh"}
          </button>
        }
      >
        <Loaded query={live} label="Base status">
          {(data) => (
            <dl className="adm-kv">
              <dt>Latest block</dt>
              <dd>{data.blockNumber ?? "Unavailable"}</dd>
              <dt>Trading</dt>
              <dd>
                {data.tradingPaused === null ? (
                  "Unavailable"
                ) : data.tradingPaused ? (
                  <Badge tone="warn">Paused</Badge>
                ) : (
                  <Badge tone="ok">Running</Badge>
                )}
              </dd>
              <dt>Markets created</dt>
              <dd>{data.nextMarketId ?? "Unavailable"}</dd>
            </dl>
          )}
        </Loaded>
      </Card>
    </div>
  );
}
