import { Link } from "@tanstack/react-router";
import { ShieldCheck, Trophy, Activity, Network, Settings2, Download } from "lucide-react";
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
        title="Settings"
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

      <Card title="Workspace tools">
        <div className="adm-tools-grid">
          {[
            { section: "ranking", view: "overview", label: "Ranking", icon: Trophy },
            { section: "users", view: "referrals", label: "Referrals", icon: Trophy },
            { section: "resolution", view: "pending", label: "Resolution", icon: ShieldCheck },
            { section: "trading", view: "trades", label: "Trades", icon: Activity },
            { section: "blockchain", view: "contracts", label: "Contracts", icon: Network },
            { section: "engine", view: "public", label: "Home & Markets", icon: Settings2 },
            { section: "engine", view: "providers", label: "Providers", icon: Download },
          ].map(({ section, view, label, icon: Icon }) => (
            <Link
              key={label}
              className="adm-tool-link"
              to="/admin/$section"
              params={{ section }}
              search={{ view }}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </div>
        <Link className="adm-link" to="/admin/market-importer">
          Market importer
        </Link>
      </Card>
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
              <dd>
                {data.rpcSource === "protocol"
                  ? "Configured provider"
                  : "Public endpoint (limited)"}
              </dd>
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
