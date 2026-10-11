import { AdminWorkspace } from "@/components/admin-workspace";
import { AdminMfa } from "@/components/admin-mfa";
import { AdminSignIn } from "@/components/admin-sign-in";
import { NativeOperatorConsole } from "@/components/native-operator-console";
import type { PreparedTerms } from "@/lib/protocol/operator-actions";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { getProtocolAdminAccess, prepareNativeMarket } from "@/lib/protocol/admin.functions";
import { BASE_NETWORK, USDC_DECIMALS } from "@/lib/onchain/base";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({ component: NativeAdmin });

const CATEGORIES = [
  "Crypto",
  "Sports",
  "News",
  "Technology",
  "Business",
  "Culture",
  "Other",
] as const;

function NativeAdmin() {
  const { user, ready } = useProtocolUser();
  const access = useQuery({
    queryKey: ["protocol-admin", user?.id],
    enabled: !!user,
    queryFn: () => getProtocolAdminAccess(),
    retry: 0,
  });
  const [prepared, setPrepared] = useState<PreparedTerms | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [marketType, setMarketType] = useState<"binary" | "multi">("binary");
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Crypto" as (typeof CATEGORIES)[number],
    outcomes: "Yes,No",
    rules: "",
    source: "",
    sourceUrl: "",
  });

  const outcomeList = useMemo(
    () =>
      form.outcomes
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    [form.outcomes],
  );

  if (!ready)
    return (
      <section className="mx-auto max-w-md py-16">
        <p role="status" className="text-sm text-muted-foreground">
          Checking administrator session…
        </p>
      </section>
    );

  if (!user)
    return <AdminSignIn onSuccess={() => window.location.assign("/admin")} />;

  if (access.isPending)
    return (
      <section className="mx-auto max-w-xl py-16">
        <h1 className="page-title">Protocol administration</h1>
        <p className="mt-4 text-sm text-muted-foreground">Checking assigned administrator role…</p>
      </section>
    );

  if (!access.data?.allowed)
    return (
      <section className="mx-auto max-w-xl space-y-4 py-16">
        <h1 className="page-title">Protocol administration</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="break-all text-foreground">{user.email ?? user.id}</span>, but
          this account does not have the database <code>admin</code> role. Login alone does not open
          the admin workspace.
        </p>
        <p className="text-sm text-muted-foreground">
          An owner must insert your user id into <code>user_roles</code> with{" "}
          <code>role = &apos;admin&apos;</code> on the main Supabase project, then refresh and
          complete TOTP.
        </p>
        <button
          type="button"
          className="finance-pill"
          onClick={() =>
            void supabase.auth.signOut().then(() => window.location.assign("/admin"))
          }
        >
          Sign out and try another account
        </button>
      </section>
    );

  if (access.data.mfaRequired) return <AdminMfa onVerified={() => void access.refetch()} />;

  return (
    <AdminWorkspace
      operator={
        <NativeOperatorConsole prepared={prepared} outcomeCount={outcomeList.length || 2} />
      }
    >
      <section className="mx-auto max-w-3xl space-y-5">
        <div>
          <h3 className="text-lg font-semibold">Prepare market (immutable terms)</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Saves approved metadata hashes in Supabase. Publishing requires a Factory wallet
            signature in the operator console — preparing alone does not create an on-chain market.
          </p>
        </div>

        <div className="grid gap-3 rounded-[26px] border border-border bg-card p-5 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Collateral
            </p>
            <p className="mt-1 text-sm font-semibold">Native USDC only</p>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {BASE_NETWORK.usdc} · {USDC_DECIMALS} decimals · {BASE_NETWORK.name} ({BASE_NETWORK.id}
              )
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Not available here
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              No TAC Points, fee %, treasury withdraw, or AMM liquidity knobs — deployed Exchange has
              no configurable platform fees.
            </p>
          </div>
        </div>

        <form
          className="space-y-4 rounded-[26px] border border-border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setPrepared(null);
            void prepareNativeMarket({
              data: {
                ...form,
                outcomes: outcomeList,
                tags: [],
              },
            })
              .then((r) => {
                setPrepared(r);
                setNotice(
                  [
                    "Metadata prepared — not published.",
                    `Metadata hash: ${r.metadataHash}`,
                    `Rules hash: ${r.rulesHash}`,
                    `Source hash: ${r.sourceHash}`,
                    `URI: ${r.metadataUri}`,
                    "Next: set open/close/resolve times in the operator console, acknowledge costs, then Create on-chain market with your authorized wallet.",
                    "Trading remains paused until an explicit reviewed unpause.",
                  ].join("\n"),
                );
              })
              .catch((err) =>
                setNotice(err instanceof Error ? err.message : "Preparation failed."),
              )
              .finally(() => setBusy(false));
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Market type</legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className={`min-h-10 rounded-full px-4 text-sm ${marketType === "binary" ? "bg-primary text-primary-foreground" : "border border-border"}`}
                onClick={() => {
                  setMarketType("binary");
                  setPrepared(null);
                  setForm((f) => ({ ...f, outcomes: "Yes,No" }));
                }}
              >
                Binary (Yes / No)
              </button>
              <button
                type="button"
                disabled={busy}
                className={`min-h-10 rounded-full px-4 text-sm ${marketType === "multi" ? "bg-primary text-primary-foreground" : "border border-border"}`}
                onClick={() => {
                  setMarketType("multi");
                  setPrepared(null);
                  setForm((f) => ({
                    ...f,
                    outcomes: f.outcomes.includes(",") && f.outcomes !== "Yes,No" ? f.outcomes : "A,B,C",
                  }));
                }}
              >
                Multi-outcome (2–8)
              </button>
            </div>
          </fieldset>

          {(
            [
              ["title", "Title"],
              ["description", "Description / question detail"],
              ["category", "Category"],
              ["outcomes", "Outcomes (comma-separated)"],
              ["rules", "Resolution criteria"],
              ["source", "Resolution source name"],
              ["sourceUrl", "Evidence / source URL (https)"],
            ] as const
          ).map(([key, label]) => (
            <label className="block text-sm" key={key}>
              <span>{label}</span>
              {key === "category" ? (
                <select
                  value={form.category}
                  disabled={busy}
                  onChange={(e) => {
                    setPrepared(null);
                    setForm({ ...form, category: e.target.value as typeof form.category });
                  }}
                  className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              ) : (
                <textarea
                  required
                  disabled={busy || (key === "outcomes" && marketType === "binary")}
                  value={form[key]}
                  onChange={(e) => {
                    setPrepared(null);
                    setForm({ ...form, [key]: e.target.value });
                  }}
                  rows={["description", "rules"].includes(key) ? 4 : 1}
                  className="mt-2 w-full rounded-xl border border-border bg-background p-3"
                />
              )}
            </label>
          ))}

          <p className="text-xs text-muted-foreground">
            Outcomes parsed: {outcomeList.length ? outcomeList.join(" · ") : "(none)"} (must be 2–8
            unique labels). Timing (open/close/resolve/deadline) is set at on-chain create — not in
            this metadata document.
          </p>

          <button
            disabled={busy || outcomeList.length < 2}
            className="min-h-12 rounded-full bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Preparing…" : "Prepare locked market terms"}
          </button>
        </form>

        {notice && (
          <p
            role="status"
            className="whitespace-pre-wrap break-all rounded-xl border border-border p-4 text-xs"
          >
            {notice}
          </p>
        )}
      </section>
    </AdminWorkspace>
  );
}
