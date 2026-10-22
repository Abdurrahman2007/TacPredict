import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatTimestamp, shortHash } from "@/lib/protocol/admin-rows.mjs";
import {
  adminUsersQueryOptions,
  setUserAdmin,
  setUserSuspended,
} from "@/lib/protocol/admin-users.functions";
import { matchesUserSearch, type AdminUser } from "@/lib/protocol/admin-users.mjs";
import { getAdminUserDetails } from "@/lib/protocol/admin-dashboard.functions";
import { adminMoney } from "@/lib/protocol/admin-dashboard.mjs";
import { AddressLink, Badge, Card, Loaded, Notice, PageHeader, Tile } from "../admin-ui";

type Tab = "all" | "admins" | "suspended";

export function UsersView({ view }: { view: string }) {
  const query = useQuery(adminUsersQueryOptions);
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>(view === "admins" ? "admins" : "all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<{ tone: "info" | "bad"; text: string } | null>(null);

  const suspend = useMutation({
    mutationFn: (v: { userId: string; suspended: boolean }) => setUserSuspended({ data: v }),
  });
  const role = useMutation({
    mutationFn: (v: { userId: string; admin: boolean }) => setUserAdmin({ data: v }),
  });
  const busy = suspend.isPending || role.isPending;

  async function run(work: Promise<unknown>, done: string) {
    setMessage(null);
    try {
      await work;
      setMessage({ tone: "info", text: done });
      await client.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      setMessage({ tone: "bad", text: err instanceof Error ? err.message : "Action failed." });
    }
  }

  return (
    <div className="adm-stack">
      <PageHeader
        title="Users"
        subtitle="Verified wallets · read-only balances"
        actions={
          <button
            type="button"
            className="adm-btn"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        }
      />
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Loaded query={query} label="users">
        {({ users, truncated, actorId }) => (
          <UserList
            users={users}
            truncated={truncated}
            actorId={actorId}
            tab={tab}
            setTab={setTab}
            search={search}
            setSearch={setSearch}
            busy={busy}
            onSuspend={(u, suspended) => {
              const verb = suspended ? "Suspend" : "Restore";
              if (window.confirm(`${verb} ${u.email ?? u.id}?`))
                void run(
                  suspend.mutateAsync({ userId: u.id, suspended }),
                  suspended
                    ? "Account suspended. They are signed out at next refresh."
                    : "Account restored.",
                );
            }}
            onAdmin={(u, admin) => {
              const text = admin
                ? `Give ${u.email ?? u.id} full admin access? They still need an authenticator to enter.`
                : `Remove admin access from ${u.email ?? u.id}?`;
              if (window.confirm(text))
                void run(
                  role.mutateAsync({ userId: u.id, admin }),
                  admin ? "Admin access granted." : "Admin access removed.",
                );
            }}
          />
        )}
      </Loaded>
    </div>
  );
}

function UserList({
  users,
  truncated,
  actorId,
  tab,
  setTab,
  search,
  setSearch,
  busy,
  onSuspend,
  onAdmin,
}: {
  users: AdminUser[];
  truncated: boolean;
  actorId: string;
  tab: Tab;
  setTab: (tab: Tab) => void;
  search: string;
  setSearch: (value: string) => void;
  busy: boolean;
  onSuspend: (user: AdminUser, suspended: boolean) => void;
  onAdmin: (user: AdminUser, admin: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const counts = useMemo(
    () => ({
      all: users.length,
      admins: users.filter((u) => u.isAdmin).length,
      suspended: users.filter((u) => u.suspended).length,
      wallets: users.filter((u) => u.wallets.length > 0).length,
    }),
    [users],
  );
  const visible = users.filter(
    (u) =>
      (tab === "all" || (tab === "admins" ? u.isAdmin : u.suspended)) &&
      matchesUserSearch(u, search),
  );

  return (
    <>
      <div className="adm-grid-tiles">
        <Tile label="Accounts" value={counts.all} />
        <Tile label="With wallet" value={counts.wallets} />
        <Tile label="Admins" value={counts.admins} />
        <Tile label="Suspended" value={counts.suspended} />
      </div>
      {truncated ? (
        <Notice tone="warn">Showing the newest 1,000 accounts. Search covers these only.</Notice>
      ) : null}
      <Card flush>
        <div className="adm-card-head" style={{ flexWrap: "wrap", gap: 10 }}>
          <input
            className="adm-input"
            style={{ maxWidth: 320 }}
            type="search"
            placeholder="Search email, wallet or ID"
            aria-label="Search users"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="adm-tabs" style={{ margin: 0 }}>
            {(
              [
                ["all", `All · ${counts.all}`],
                ["admins", `Admins · ${counts.admins}`],
                ["suspended", `Suspended · ${counts.suspended}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="adm-tab"
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {visible.length === 0 ? (
          <div className="adm-card-body">
            <p className="adm-muted" style={{ margin: 0 }}>
              {users.length === 0 ? "No accounts yet." : "No account matches."}
            </p>
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Wallet</th>
                  <th>Balance / trades</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <Fragment key={u.id}>
                    <tr>
                      <td>
                        <div style={{ fontWeight: 650, overflowWrap: "anywhere" }}>
                          {u.email ?? "No email (wallet sign-in)"}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                          {u.isAdmin ? <Badge tone="brand">Admin</Badge> : null}
                          {u.suspended ? <Badge tone="bad">Suspended</Badge> : null}
                          {u.id === actorId ? <Badge tone="mute">You</Badge> : null}
                        </div>
                      </td>
                      <td>
                        {u.wallets.length === 0 ? (
                          <span className="adm-muted">None</span>
                        ) : (
                          u.wallets.map((w) => (
                            <div key={w} title={w}>
                              <AddressLink address={w} label={shortHash(w, 6, 4) ?? w} />
                            </div>
                          ))
                        )}
                      </td>
                      <td>
                        <button
                          className="adm-btn"
                          aria-expanded={selected === u.id}
                          onClick={() => setSelected(selected === u.id ? null : u.id)}
                        >
                          {selected === u.id ? "Close details" : "View details"}
                        </button>
                      </td>
                      <td>
                        <Badge tone={u.suspended ? "bad" : "ok"}>
                          {u.suspended ? "Suspended" : "Active"}
                        </Badge>
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                            justifyContent: "flex-end",
                          }}
                        >
                          <button
                            type="button"
                            className="adm-btn"
                            disabled={busy || (!u.suspended && (u.id === actorId || u.isAdmin))}
                            title={
                              !u.suspended && u.isAdmin ? "Remove the admin role first" : undefined
                            }
                            onClick={() => onSuspend(u, !u.suspended)}
                          >
                            {u.suspended ? "Restore" : "Suspend"}
                          </button>
                          <button
                            type="button"
                            className="adm-btn"
                            disabled={
                              busy || (u.isAdmin && u.id === actorId) || (!u.isAdmin && u.suspended)
                            }
                            onClick={() => onAdmin(u, !u.isAdmin)}
                          >
                            {u.isAdmin ? "Remove admin" : "Make admin"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {selected === u.id && (
                      <tr className="adm-row-open">
                        <td colSpan={5}>
                          <UserDetails user={u} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function UserDetails({ user }: { user: AdminUser }) {
  const q = useQuery({
    queryKey: ["admin-user-details", user.id],
    queryFn: () => getAdminUserDetails({ data: { userId: user.id } }),
    retry: 0,
    staleTime: 30000,
  });
  return (
    <div className="adm-stack">
      <dl className="adm-kv">
        <dt>Account</dt>
        <dd className="adm-mono">{user.id}</dd>
        <dt>Joined</dt>
        <dd>{formatTimestamp(user.createdAt) ?? "Unavailable"}</dd>
        <dt>Last seen</dt>
        <dd>{formatTimestamp(user.lastSignInAt) ?? "Never"}</dd>
        <dt>Open positions</dt>
        <dd>{user.openPositions}</dd>
      </dl>
      <Loaded query={q} label="wallet balances">
        {(d) => (
          <>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Verified wallet</th>
                    <th>USDC balance</th>
                    <th>Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {d.wallets.map((w) => (
                    <tr key={w.address}>
                      <td>
                        <AddressLink
                          address={w.address}
                          label={shortHash(w.address) ?? w.address}
                        />
                      </td>
                      <td>{adminMoney(w.balanceAtomic)}</td>
                      <td>{w.executions ?? "Unavailable"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!d.wallets.length && <p className="adm-caption">No verified wallets</p>}
            <p className="adm-caption">{d.scope}. Balances cannot be edited.</p>
          </>
        )}
      </Loaded>
    </div>
  );
}
