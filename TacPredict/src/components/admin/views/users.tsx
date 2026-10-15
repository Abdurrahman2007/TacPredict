import { useAdminSnapshot } from "../admin-data";
import { Loaded, Notice, PageHeader, Tile, Unavailable } from "../admin-ui";
import type { AdminRow } from "@/lib/protocol/admin-rows.mjs";

function leadingCount(detail: string): string | null {
  const match = /^(\d+)\b/.exec(detail);
  return match?.[1] ?? null;
}

function UserCounts({ rows, only }: { rows: AdminRow[]; only: "users" | "wallets" }) {
  const row = rows.find((r) => r.id === only);
  if (!row)
    return (
      <Notice tone="warn">The snapshot did not include this count. Nothing has been assumed.</Notice>
    );
  return (
    <div className="adm-grid-tiles">
      <Tile
        label={row.label}
        value={leadingCount(row.detail) ?? "Unavailable"}
        hint={row.detail.replace(/^\d+\s*/, "")}
      />
    </div>
  );
}

export function UsersView({ view }: { view: string }) {
  const query = useAdminSnapshot("Users");
  if (view === "risk")
    return (
      <div className="adm-stack">
        <PageHeader title="Risk" subtitle="Abuse signals and account restrictions." />
        <Unavailable
          title="Risk tooling is not enabled"
          needs="Defined risk rules, a signal source and an audited restriction workflow."
        >
          No risk scores, flags or blocks are shown because none are computed. Administrators also
          cannot edit balances or positions.
        </Unavailable>
      </div>
    );
  const isWallets = view === "wallets";
  return (
    <div className="adm-stack">
      <PageHeader
        title={isWallets ? "Wallets" : "Users"}
        subtitle={
          isWallets
            ? "Wallets linked to accounts through a signed proof."
            : "Registered accounts in the main Supabase project."
        }
      />
      <Loaded query={query} label="user counts">
        {(snapshot) => <UserCounts rows={snapshot.rows} only={isWallets ? "wallets" : "users"} />}
      </Loaded>
      <Unavailable
        title={isWallets ? "Wallet list is not enabled" : "User list is not enabled"}
        needs={
          isWallets
            ? "An admin read function listing verified wallet links without exposing private data."
            : "An admin read function with an agreed privacy scope for account details."
        }
      >
        Only the count is available. Individual records are not listed, and a connected wallet is
        never treated as proof of ownership.
      </Unavailable>
    </div>
  );
}
