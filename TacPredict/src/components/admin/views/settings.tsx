import { formatTimestamp } from "@/lib/protocol/admin-rows.mjs";
import { useAdminSnapshot, useLiveChain } from "../admin-data";
import { Badge, Card, Loaded, PageHeader } from "../admin-ui";

export function SettingsView({ view }: { view: string }) {
  switch (view) {
    case "audit":
      return <AuditView />;
    default:
      return <SystemView />;
  }
}

function SystemView() {
  const live = useLiveChain();
  const dashboard = useAdminSnapshot("Dashboard");
  return (
    <div className="adm-stack">
      <PageHeader
        title="System"
        subtitle="Chain connection and indexer status."
        actions={
          <button
            type="button"
            className="adm-btn"
            disabled={live.isFetching}
            onClick={() => void live.refetch()}
          >
            {live.isFetching ? "Reading Base…" : "Refresh from Base"}
          </button>
        }
      />
      <Loaded query={live} label="chain status">
        {(data) => (
          <Card title="Base Mainnet">
            <dl className="adm-kv">
              <dt>Network</dt>
              <dd>Base Mainnet (chain {data.chainId})</dd>
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
              <dt>RPC source</dt>
              <dd>{data.rpcSource === "protocol" ? "Configured provider" : "Public endpoint (limited)"}</dd>
              <dt>Observed</dt>
              <dd>{formatTimestamp(data.observedAt) ?? data.observedAt}</dd>
            </dl>
          </Card>
        )}
      </Loaded>
      <Loaded query={dashboard} label="indexer status">
        {(snapshot) => {
          const job = snapshot.rows.find((r) => r.id === "last-job");
          return (
            <Card title="Indexer job">
              <dl className="adm-kv">
                <dt>Latest status</dt>
                <dd>{job?.detail ?? "Unavailable"}</dd>
                <dt>Finished</dt>
                <dd>{formatTimestamp(job?.observedAt) ?? "Unavailable"}</dd>
              </dl>
            </Card>
          );
        }}
      </Loaded>
    </div>
  );
}

/** MARKET_METADATA_PREPARED -> "Market metadata prepared". */
function readableAction(code: string): string {
  const text = code.replace(/_/g, " ").toLowerCase().trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : code;
}

function AuditView() {
  const query = useAdminSnapshot("Audit");
  return (
    <div className="adm-stack">
      <PageHeader title="Audit log" subtitle="Latest 50 admin actions." />
      <Loaded query={query} label="audit log">
        {(snapshot) => (
          <Card flush>
            {snapshot.rows.length === 0 ? (
              <div className="adm-card-body">
                <p className="adm-muted" style={{ margin: 0 }}>
                  Nothing recorded yet.
                </p>
              </div>
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.rows.map((r) => (
                      <tr key={r.id}>
                        <td>{formatTimestamp(r.observedAt) ?? "Unavailable"}</td>
                        <td style={{ fontWeight: 650 }}>{readableAction(r.label)}</td>
                        <td className="adm-mono" style={{ overflowWrap: "anywhere" }}>
                          {r.detail}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </Loaded>
    </div>
  );
}
