import { atomicToDecimal } from "@/lib/protocol/admin-rows.mjs";
import { useAdminSnapshot } from "../admin-data";
import { Card, Loaded, Notice, PageHeader, Tile, Unavailable } from "../admin-ui";

export function AnalyticsView() {
  const query = useAdminSnapshot("Analytics");
  return (
    <div className="adm-stack">
      <PageHeader
        title="Analytics"
        subtitle="Finalized Exchange volume on Base Mainnet."
      />
      <Loaded query={query} label="analytics">
        {(snapshot) => (
          <div className="adm-grid-tiles">
            {snapshot.rows.map((row) => {
              const value = atomicToDecimal(row.usdcAtoms);
              return (
                <Tile
                  key={row.id}
                  label={row.label}
                  value={value === null ? "Unavailable" : `${value} USDC`}
                  hint={row.detail}
                />
              );
            })}
          </div>
        )}
      </Loaded>
      <Card title="Not measured yet">
        <ul className="adm-muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>Active traders and retention</li>
          <li>Per-market and per-category volume</li>
          <li>Open interest and order-book depth</li>
          <li>Fee revenue (the Exchange has no platform fee)</li>
        </ul>
      </Card>
    </div>
  );
}

export function NotificationsView() {
  return (
    <div className="adm-stack">
      <PageHeader title="Notifications" subtitle="Messages to users and operator alerts." />
      <Unavailable
        title="Notifications are not enabled"
        needs="A delivery channel, templates and an admin read/write function over protocol_notifications."
      >
        Nothing is sent or listed from here. No delivery counts are shown.
      </Unavailable>
      <Notice>User-facing notifications will be configured here once a delivery provider is chosen.</Notice>
    </div>
  );
}
