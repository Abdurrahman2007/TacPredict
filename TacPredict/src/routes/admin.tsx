import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { getProtocolAdminAccess, prepareNativeMarket } from "@/lib/protocol/admin.functions";
export const Route = createFileRoute("/admin")({ component: NativeAdmin });
function NativeAdmin() {
  const { user } = useProtocolUser();
  const access = useQuery({
    queryKey: ["protocol-admin", user?.id],
    enabled: !!user,
    queryFn: () => getProtocolAdminAccess(),
    retry: 0,
  });
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Crypto" as
      "Crypto" | "Sports" | "News" | "Technology" | "Business" | "Culture" | "Other",
    outcomes: "Yes,No",
    rules: "",
    source: "",
    sourceUrl: "",
  });
  if (!user || !access.data?.allowed)
    return (
      <section className="mx-auto max-w-xl py-16">
        <h1 className="page-title">Protocol administration</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {access.isPending && user
            ? "Checking assigned administrator role…"
            : "An administrator role assigned in the main database is required. Login alone does not grant admin access."}
        </p>
      </section>
    );
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="page-title">Native market administration</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Prepare immutable resolution terms in the main Supabase project. Publishing requires an
        authorized on-chain Factory transaction and a finalized indexer event.
      </p>
      <form
        className="mt-6 space-y-4 rounded-[26px] border border-border bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void prepareNativeMarket({
            data: { ...form, outcomes: form.outcomes.split(",").map((x) => x.trim()), tags: [] },
          })
            .then((r) =>
              setNotice(
                `Metadata prepared, not published.\nMetadata hash: ${r.metadataHash}\nRules hash: ${r.rulesHash}\nSource hash: ${r.sourceHash}\nURI: ${r.metadataUri}\nUse the testnet deployment/market-creation runbook. No contract transaction has been submitted.`,
              ),
            )
            .catch((e) => setNotice(e instanceof Error ? e.message : "Preparation failed."))
            .finally(() => setBusy(false));
        }}
      >
        {(
          ["title", "description", "category", "outcomes", "rules", "source", "sourceUrl"] as const
        ).map((key) => (
          <label className="block text-sm" key={key}>
            <span className="capitalize">{key}</span>
            {key === "category" ? (
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as typeof form.category })
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"
              >
                {["Crypto", "Sports", "News", "Technology", "Business", "Culture", "Other"].map(
                  (c) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </select>
            ) : (
              <textarea
                required
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                rows={["description", "rules"].includes(key) ? 4 : 1}
                className="mt-2 w-full rounded-xl border border-border bg-background p-3"
              />
            )}
          </label>
        ))}
        <button
          disabled={busy}
          className="min-h-12 rounded-full bg-primary px-5 font-semibold text-primary-foreground"
        >
          {busy ? "Preparing…" : "Prepare locked market terms"}
        </button>
      </form>
      {notice && (
        <p
          role="status"
          className="mt-5 whitespace-pre-wrap break-all rounded-xl border border-border p-4 text-xs"
        >
          {notice}
        </p>
      )}
    </section>
  );
}
