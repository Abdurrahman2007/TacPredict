import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatAdminUSDC, type AdminSection } from "@/lib/protocol/admin-view";
import { getProtocolAdminSnapshot } from "@/lib/protocol/admin.functions";
import {
  adminNavGroups,
  capabilityLabel,
  type AdminCapability,
  type AdminNavItem,
} from "@/lib/protocol/admin-nav";

function Cap({ c }: { c: AdminCapability }) {
  const tone =
    c === "blocked"
      ? "border-border text-muted-foreground"
      : c === "operator"
        ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
        : c === "live"
          ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
          : "border-border text-foreground";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
      {capabilityLabel(c)}
    </span>
  );
}

export function AdminWorkspace({
  children,
  operator,
}: {
  children: ReactNode;
  operator: ReactNode;
}) {
  const [navId, setNavId] = useState("dashboard");
  const active: AdminNavItem =
    adminNavGroups.flatMap((g) => g.items).find((i) => i.id === navId) ??
    adminNavGroups[0]!.items[0]!;
  const section: AdminSection = active.section;
  const q = useQuery({
    queryKey: ["admin-snapshot", section],
    queryFn: () => getProtocolAdminSnapshot({ data: { section } }),
    retry: 0,
    refetchInterval: 30000,
  });
  const showCreate = active.id === "markets-create" || active.id === "markets-all";
  const showOperator =
    active.capability === "operator" ||
    ["resolution", "disputes", "operator", "settlement"].includes(active.id);

  return (
    <section className="mx-auto max-w-6xl pb-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">
            TacPredict · Operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Admin workspace</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            A→Z operations shell over finalized Base events. Financial truth is on-chain USDC —
            never manual balance edits, fabricated fees, or shared-password unlocks.
          </p>
        </div>
        <span className="rounded-full border border-border px-4 py-2 text-xs">
          Base Mainnet · USDC only · trading paused
        </span>
      </header>
      <div className="grid min-w-0 gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label="Administrator navigation"
          className="flex min-w-0 gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:gap-4"
        >
          {adminNavGroups.map((group) => (
            <div key={group.title} className="min-w-0 shrink-0 md:shrink">
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
                {group.title}
              </p>
              <div className="flex gap-1 md:flex-col">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    aria-current={navId === item.id ? "page" : undefined}
                    onClick={() => setNavId(item.id)}
                    className={`min-h-10 shrink-0 rounded-xl px-3 text-left text-sm transition-colors ${navId === item.id ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:bg-card hover:text-foreground"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <main className="min-w-0 space-y-5" aria-busy={q.isFetching}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">{active.label}</h2>
                <Cap c={active.capability} />
              </div>
              <p className="text-xs text-muted-foreground">{active.note}</p>
            </div>
            <button
              className="finance-pill"
              disabled={q.isFetching}
              onClick={() => void q.refetch()}
            >
              Refresh
            </button>
          </div>

          {active.capability === "blocked" && (
            <div role="status" className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
              This module is intentionally unavailable against the deployed contracts or unfinished
              app scope. No fake balances, fee sweeps, or role grants are exposed here.
            </div>
          )}

          <p className="text-xs leading-6 text-muted-foreground">
            Finalized indexed Base data. Snapshot rows are bounded (≤50). Unavailable metrics stay
            unavailable — zeros are not invented.
          </p>

          {active.capability !== "blocked" &&
            (q.isPending ? (
              <p role="status" className="finance-card">
                Loading verified administrator data…
              </p>
            ) : q.isError ? (
              <div role="alert" className="finance-card space-y-3">
                <p>
                  Administrator data unavailable. Confirm main Supabase URL, AAL2 session, and
                  assigned admin role. No green health states were substituted.
                </p>
                <button className="finance-pill" onClick={() => void q.refetch()}>
                  Try again
                </button>
              </div>
            ) : q.data?.rows.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {q.data.rows.map((r) => (
                  <article key={r.id} className="rounded-2xl border border-border bg-card p-5">
                    <h3 className="break-words text-sm font-semibold">{r.label}</h3>
                    <p className="mt-2 whitespace-pre-wrap break-all text-xs leading-6 text-muted-foreground">
                      {r.detail}
                    </p>
                    {r.usdcAtoms !== null && (
                      <p className="mt-3 break-all text-lg font-semibold">
                        {formatAdminUSDC(r.usdcAtoms)}
                      </p>
                    )}
                    {r.observedAt && (
                      <p className="mt-3 text-[10px] text-muted-foreground">
                        Observed {r.observedAt}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="finance-card">
                <h3 className="font-semibold">No indexed records yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Empty is honest: no native markets or trades have been indexed. Demo rows are not
                  inserted.
                </p>
              </div>
            ))}

          {showCreate && children}
          {showOperator && operator}

          <aside className="rounded-2xl border border-border p-5 text-xs leading-6 text-muted-foreground">
            <p className="font-semibold text-foreground">Architecture invariants</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>ADMIN → API/DB → Indexer ↔ Base contracts ↔ USDC</li>
              <li>Collateral is native Base USDC only (6 decimals). No TAC Points / swaps / games.</li>
              <li>Lifecycle follows Registry/Oracle — no frontend OPEN→RESOLVED shortcut.</li>
              <li>
                Login is Supabase account + assigned <code>admin</code> role + TOTP AAL2. Shared
                chat passwords are never accepted as authorization.
              </li>
            </ul>
          </aside>
        </main>
      </div>
    </section>
  );
}
