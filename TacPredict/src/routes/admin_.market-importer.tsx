import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { getProtocolAdminAccess } from "@/lib/protocol/admin.functions";
import {
  getMarketImportAdmin,
  setMarketImportEnabled,
  reviewMarketCandidate,
} from "@/lib/agent/discovery.functions";
import { AdminMfa } from "@/components/admin-mfa";
import { AuthPanel } from "@/components/auth-panel";
export const Route = createFileRoute("/admin_/market-importer")({ component: ImporterPage });
function ImporterPage() {
  const { user } = useProtocolUser();
  const access = useQuery({
    queryKey: ["protocol-admin", user?.id],
    enabled: !!user,
    queryFn: () => getProtocolAdminAccess(),
    retry: 0,
  });
  if (!user)
    return (
      <div className="mx-auto max-w-sm">
        <AuthPanel onSuccess={() => window.location.assign("/admin/market-importer")} />
      </div>
    );
  if (!access.data?.allowed)
    return (
      <p className="py-14 text-muted-foreground">
        {access.isPending ? "Checking administrator access…" : "Assigned administrator required."}
      </p>
    );
  if (access.data.mfaRequired) return <AdminMfa onVerified={() => void access.refetch()} />;
  return <ImporterWorkspace />;
}
function ImporterWorkspace() {
  const q = useQuery({
    queryKey: ["market-import-admin"],
    queryFn: () => getMarketImportAdmin(),
    retry: 0,
    refetchInterval: 30000,
  });
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      await q.refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-5xl">
      <Link to="/admin" className="text-xs text-muted-foreground">
        ← Admin workspace
      </Link>
      <h1 className="mt-5 page-title">Market discovery agent</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Metadata only. Polymarket financial data is never imported. Original crypto previews are not
        on-chain markets. AI reviews clarity; it cannot authorize publication, prices or resolution.
      </p>
      {q.isPending ? (
        <p className="mt-6 finance-card">Loading importer…</p>
      ) : q.isError ? (
        <div role="alert" className="mt-6 finance-card">
          Importer unavailable.{" "}
          <button onClick={() => void q.refetch()} className="text-primary">
            Retry
          </button>
        </div>
      ) : (
        q.data && (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="finance-badge">
                Discovery {q.data.policy.discovery_enabled ? "ON" : "OFF"}
              </span>
              <span className="finance-badge">Auto-publish OFF</span>
              <span className="finance-badge">Every 15 minutes</span>
              <button
                disabled={busy}
                className="finance-pill"
                onClick={() =>
                  void action(() =>
                    setMarketImportEnabled({
                      data: { enabled: !q.data!.policy.discovery_enabled },
                    }),
                  )
                }
              >
                {q.data.policy.discovery_enabled ? "Pause discovery" : "Resume discovery"}
              </button>
              <button
                disabled={busy}
                className="finance-pill"
                onClick={() =>
                  void action(async () => {
                    const { data } = await supabase.auth.getSession();
                    if (!data.session) throw Error("Sign in again");
                    const r = await fetch("/api/agent/discover", {
                      method: "POST",
                      headers: { Authorization: `Bearer ${data.session.access_token}` },
                    });
                    if (!r.ok) throw Error("Importer retry requires an assigned admin with MFA");
                    const result = (await r.json()) as { status: string };
                    setNotice(`Discovery ${result.status}`);
                  })
                }
              >
                Run discovery now
              </button>
              <button
                disabled={q.isFetching}
                className="finance-pill"
                onClick={() => void q.refetch()}
              >
                Refresh
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(q.data.counts)
                .filter(([k]) => k !== "previews")
                .map(([key, value]) => (
                  <div key={key} className="finance-card">
                    <p className="text-xs text-muted-foreground">{key}</p>
                    <p className="mt-2 text-2xl font-semibold">{value}</p>
                  </div>
                ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Last successful sync: {q.data.policy.last_success_at ?? "Not run yet"}
              {q.data.policy.last_error ? ` · ${q.data.policy.last_error}` : ""}
            </p>
            <h2 className="mt-8 text-lg font-semibold">Candidate queue</h2>
            <div className="mt-4 space-y-3">
              {q.data.candidates.map((c) => (
                <article key={c.id} className="finance-card">
                  <div className="flex flex-wrap justify-between gap-3">
                    <h3 className="text-sm font-semibold">{c.title}</h3>
                    <span className="finance-badge">{c.status}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {c.source} · {c.category} · Candidate UUID {c.id}
                  </p>
                  <ul className="mt-3 list-inside list-disc text-xs leading-6 text-muted-foreground">
                    {c.validation.reasons?.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer">Proposed rules and AI review</summary>
                    <p className="mt-3 whitespace-pre-wrap leading-6">{c.proposed_rules}</p>
                    <pre className="mt-3 overflow-auto whitespace-pre-wrap text-[10px]">
                      {JSON.stringify(
                        c.validation.aiReview ?? { status: "Not reviewed by AI" },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <a
                      href={c.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="finance-pill"
                    >
                      Source ↗
                    </a>
                    {c.source === "polymarket" && (
                      <>
                        <button
                          disabled={busy || c.status === "REVIEWED"}
                          className="finance-pill"
                          onClick={() =>
                            void action(() =>
                              reviewMarketCandidate({ data: { id: c.id, reject: false } }),
                            )
                          }
                        >
                          Mark reviewed · not publish
                        </button>
                        <button
                          disabled={busy || c.status === "REJECTED"}
                          className="finance-pill"
                          onClick={() =>
                            void action(() =>
                              reviewMarketCandidate({ data: { id: c.id, reject: true } }),
                            )
                          }
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <h2 className="mt-8 text-lg font-semibold">Recent runs</h2>
            {q.data.runs.map((r) => (
              <p key={r.id} className="mt-3 text-xs text-muted-foreground">
                {r.started_at} · {r.status} · AI review{" "}
                {r.ai_reviewed ? "completed" : "not completed"}
              </p>
            ))}
          </>
        )
      )}
      <p role="status" className="mt-4 text-sm text-muted-foreground">
        {notice}
      </p>
    </section>
  );
}
