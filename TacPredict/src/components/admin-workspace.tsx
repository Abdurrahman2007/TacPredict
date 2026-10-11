import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminSections, formatAdminUSDC, type AdminSection } from "@/lib/protocol/admin-view";
import { getProtocolAdminSnapshot } from "@/lib/protocol/admin.functions";
export function AdminWorkspace({
  children,
  operator,
}: {
  children: ReactNode;
  operator: ReactNode;
}) {
  const [section, setSection] = useState<AdminSection>("Dashboard");
  const q = useQuery({
    queryKey: ["admin-snapshot", section],
    queryFn: () => getProtocolAdminSnapshot({ data: { section } }),
    retry: 0,
    refetchInterval: 30000,
  });
  return (
    <section className="mx-auto max-w-6xl pb-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">
            TacPredict · Operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Admin workspace</h1>
        </div>
        <span className="rounded-full border border-border px-4 py-2 text-xs">
          Base Mainnet · USDC only
        </span>
      </header>
      <div className="grid min-w-0 gap-6 md:grid-cols-[190px_minmax(0,1fr)]">
        <nav
          aria-label="Administrator navigation"
          className="flex min-w-0 gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible"
        >
          <Link to="/admin/market-importer" className="finance-pill">
            Market importer ↗
          </Link>
          {adminSections.map((s) => (
            <button
              key={s}
              aria-current={section === s ? "page" : undefined}
              onClick={() => setSection(s)}
              className={`min-h-11 shrink-0 rounded-xl px-4 text-left text-sm transition-colors ${section === s ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:bg-card hover:text-foreground"}`}
            >
              {s}
            </button>
          ))}
        </nav>
        <main className="min-w-0 space-y-5" aria-busy={q.isFetching}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">{section}</h2>
            <button
              className="finance-pill"
              disabled={q.isFetching}
              onClick={() => void q.refetch()}
            >
              Refresh
            </button>
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            Finalized indexed Base data. No manual balances, prices or financial overrides.
            Recent-record views are bounded to 50 entries; they are not complete exports.
          </p>
          {q.isPending ? (
            <p role="status" className="finance-card">
              Loading verified administrator data…
            </p>
          ) : q.isError ? (
            <div role="alert" className="finance-card space-y-3">
              <p>
                Administrator data unavailable. No zero balances or green health states have been
                substituted.
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
                No demo records have been added. Live records appear after authorized actions and
                finalized indexing.
              </p>
            </div>
          )}
          {section === "Markets" && children}
          {["Resolution", "Blockchain"].includes(section) && operator}
          <aside className="rounded-2xl border border-border p-5 text-xs leading-6 text-muted-foreground">
            Phase-one read workspace. Four-role management, complete paginated investigation/export,
            provider monitoring, risk workflows, notifications and treasury administration are not
            implemented here. Contracts remain paused; public source matching is not an independent
            audit. Financial action buttons below still require simulation, on-chain authorization
            and your explicit wallet signature.
          </aside>
        </main>
      </div>
    </section>
  );
}
