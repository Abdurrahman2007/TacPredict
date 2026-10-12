import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { getProtocolAdminAccess } from "@/lib/protocol/admin.functions";
import {
  getMarketImportAdmin,
  setMarketImportEnabled,
  reviewMarketCandidate,
} from "@/lib/agent/discovery.functions";
import { buildTacPredictFactoryDraft } from "@/lib/agent/factory-draft";
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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);

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

  const stats = useMemo(() => {
    if (!q.data) return null;
    const validated =
      q.data.counts.validated ??
      q.data.candidates.filter((c) => c.status === "REVIEWED").length;
    return {
      discovered: q.data.counts.discovered,
      validated,
      published: q.data.counts.published,
      rejected: q.data.counts.rejected,
    };
  }, [q.data]);

  const selectedDraft = useMemo(() => {
    if (!q.data || !draftId) return null;
    const c = q.data.candidates.find((item) => item.id === draftId);
    if (!c) return null;
    return buildTacPredictFactoryDraft({
      id: c.id,
      source: c.source,
      source_market_id: c.source_market_id ?? c.id,
      title: c.title,
      category: c.category,
      proposed_rules: c.proposed_rules,
      source_url: c.source_url,
      ...(c.outcomes ? { outcomes: c.outcomes } : {}),
      ...(c.close_at ? { close_at: c.close_at } : {}),
      ...(c.fingerprint ? { fingerprint: c.fingerprint } : {}),
    });
  }, [q.data, draftId]);

  return (
    <section className="mx-auto max-w-5xl">
      <Link to="/admin" className="text-xs text-muted-foreground">
        ← Admin workspace
      </Link>
      <h1 className="mt-5 page-title">AI Market Importer</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Polymarket → candidate queue → AI clarity review → human validation. TacPredict then uses
        its own Market ID, Base USDC collateral, CLOB prices, oracle and settlement. Polymarket
        odds/volume are reference metadata only — never live TacPredict prices.
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
        q.data &&
        stats && (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <article className="finance-card">
                <p className="text-xs text-muted-foreground">Auto Import</p>
                <p className="mt-2 text-lg font-semibold">Polymarket discovery worker</p>
                <p className="mt-3 finance-badge">
                  {q.data.policy.discovery_enabled ? "Enabled" : "Paused"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Interval: {q.data.policy.interval_minutes ?? 15} minutes · categories:{" "}
                  {(q.data.policy.categories ?? ["Crypto", "Sports"]).join(", ")}
                </p>
              </article>
              <article className="finance-card">
                <p className="text-xs text-muted-foreground">Auto Publish</p>
                <p className="mt-2 text-lg font-semibold">Validated markets only</p>
                <p className="mt-3 finance-badge">Policy controlled · OFF</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Locked until Factory publisher + oracle rules + USDC collateral are approved.
                </p>
              </article>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["Discovered", stats.discovered],
                  ["Validated", stats.validated],
                  ["Published", stats.published],
                  ["Rejected", stats.rejected],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="finance-card">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
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
                {q.data.policy.discovery_enabled ? "Emergency pause" : "Resume discovery"}
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

            <p className="mt-4 text-xs text-muted-foreground">
              Last successful sync: {q.data.policy.last_success_at ?? "Not run yet"}
              {q.data.policy.last_error ? ` · ${q.data.policy.last_error}` : ""}
            </p>

            <h2 className="mt-8 text-lg font-semibold">Candidate queue</h2>
            <div className="mt-4 space-y-3">
              {q.data.candidates.map((c) => {
                const ref = c.validation.externalReference;
                return (
                  <article key={c.id} className="finance-card">
                    <div className="flex flex-wrap justify-between gap-3">
                      <h3 className="text-sm font-semibold">{c.title}</h3>
                      <span className="finance-badge">{c.status}</span>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {c.source} · {c.category} · source id {c.source_market_id ?? "—"} · candidate{" "}
                      {c.id}
                    </p>
                    {ref?.outcomePrices && (
                      <p className="mt-2 text-[11px] text-amber-200/80">
                        External reference odds: [{ref.outcomePrices.map((p) => p.toFixed(2)).join(", ")}]
                        {" · "}
                        not TacPredict live price
                      </p>
                    )}
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
                        Source market ↗
                      </a>
                      <button
                        type="button"
                        className="finance-pill"
                        onClick={() => setDraftId(draftId === c.id ? null : c.id)}
                      >
                        {draftId === c.id ? "Hide factory draft" : "Preview TacPredict draft"}
                      </button>
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
                            Mark validated · not publish
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
                    {draftId === c.id && selectedDraft && (
                      <pre className="mt-4 overflow-auto rounded-xl bg-black/30 p-3 text-[10px] leading-5">
                        {JSON.stringify(selectedDraft, null, 2)}
                      </pre>
                    )}
                  </article>
                );
              })}
            </div>

            <h2 className="mt-8 text-lg font-semibold">Audit · recent runs</h2>
            {q.data.runs.map((r) => (
              <p key={r.id} className="mt-3 text-xs text-muted-foreground">
                {r.started_at} · {r.status} · discovered {r.discovered ?? "—"} · rejected{" "}
                {r.rejected ?? "—"} · AI review {r.ai_reviewed ? "completed" : "not completed"}
                {r.error ? ` · ${r.error}` : ""}
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
