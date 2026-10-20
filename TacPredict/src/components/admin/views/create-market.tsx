import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SECTIONS, termsForSection, type Section } from "@/domain/markets/sections.mjs";
import { validateDraft, type Draft, type DraftTimes } from "@/lib/protocol/market-templates.mjs";
import { hasDraft, takeDraft } from "../draft-handoff";
import { CryptoSeries } from "./crypto-series";
import { NativeOperatorConsole } from "@/components/native-operator-console";
import { prepareNativeMarket, uploadMarketImage } from "@/lib/protocol/admin.functions";
import { prepareMarketImage } from "@/lib/protocol/market-image-client";
import type { PreparedTerms } from "@/lib/protocol/operator-actions";
import { Card, Notice, PageHeader } from "../admin-ui";

type FormKey = "title" | "description" | "outcomes" | "rules" | "source" | "sourceUrl";

const FIELDS: { key: FormKey; label: string; rows: number }[] = [
  { key: "title", label: "Title", rows: 1 },
  { key: "description", label: "Description / question detail", rows: 4 },
  { key: "outcomes", label: "Outcomes (comma-separated)", rows: 1 },
  { key: "rules", label: "Resolution criteria", rows: 4 },
  { key: "source", label: "Resolution source name", rows: 1 },
  { key: "sourceUrl", label: "Evidence / source URL (https)", rows: 1 },
];

/**
 * Crypto comes first by coin (BTC, ETH, SOL, BNB) and fills itself in. Football and Cricket keep the
 * match form: step 1 saves immutable terms in Supabase, step 2 publishes them with a wallet-signed call.
 */
export function CreateMarket() {
  const [tab, setTab] = useState<"crypto" | "matches">(() => (hasDraft() ? "matches" : "crypto"));
  return (
    <div className="adm-stack">
      <PageHeader
        title="Create market"
        subtitle={
          tab === "crypto"
            ? "Pick a coin. Title, rules, times and the Up / Down outcomes are filled in for you."
            : "Step 1 saves the terms. Step 2 publishes them on Base with your wallet. Trading stays paused until you unpause it."
        }
      />
      <div className="adm-tabs" role="group" aria-label="Market kind" style={{ margin: 0 }}>
        <button type="button" className="adm-tab" aria-pressed={tab === "crypto"} onClick={() => setTab("crypto")}>
          Crypto Up / Down
        </button>
        <button type="button" className="adm-tab" aria-pressed={tab === "matches"} onClick={() => setTab("matches")}>
          Football &amp; Cricket
        </button>
      </div>
      {tab === "crypto" ? <CryptoSeries /> : <SportsMarketForm initialSection="Football" />}
    </div>
  );
}

function SportsMarketForm({ initialSection }: { initialSection: Section }) {
  const [prepared, setPrepared] = useState<PreparedTerms | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [marketType, setMarketType] = useState<"binary" | "multi">("binary");
  const [form, setForm] = useState({
    title: "",
    description: "",
    section: initialSection,
    outcomes: "Yes,No",
    rules: "",
    source: "",
    sourceUrl: "",
    image: "",
  });
  const [uploading, setUploading] = useState(false);
  const [templateTimes, setTemplateTimes] = useState<DraftTimes | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [fromEngine, setFromEngine] = useState(false);

  // A draft prepared on the Market engine page arrives here once, as plain form values.
  useEffect(() => {
    const draft: Draft | null = takeDraft();
    if (!draft) return;
    const section: Section =
      draft.subcategory === "Football" ? "Football" : draft.subcategory === "Cricket" ? "Cricket" : "Crypto";
    setTemplateTimes(draft.times);
    setTags(draft.tags);
    setFromEngine(true);
    setMarketType("multi");
    setPrepared(null);
    setForm((f) => ({
      ...f,
      section,
      title: draft.title,
      description: draft.description,
      outcomes: draft.outcomes,
      rules: draft.rules,
      source: draft.source,
      sourceUrl: draft.sourceUrl,
    }));
  }, []);

  const outcomeList = useMemo(
    () =>
      form.outcomes
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    [form.outcomes],
  );

  const terms = termsForSection(form.section);
  const problems = useMemo(
    () =>
      form.title || form.rules
        ? validateDraft(
            {
              title: form.title,
              outcomes: form.outcomes,
              rules: form.rules,
              sourceUrl: form.sourceUrl,
              category: terms.category,
              ...(terms.subcategory ? { subcategory: terms.subcategory } : {}),
              ...(templateTimes ? { times: templateTimes } : {}),
            },
            Date.now(),
            { times: Boolean(templateTimes) },
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.title, form.outcomes, form.rules, form.sourceUrl, form.section, templateTimes],
  );

  function edit(next: Partial<typeof form>) {
    setPrepared(null);
    setForm((f) => ({ ...f, ...next }));
  }

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setNotice(null);
    try {
      const body = await prepareMarketImage(file);
      const { url } = await uploadMarketImage({ data: { data: body } });
      edit({ image: url });
    } catch (err) {
      setNotice({ tone: "bad", text: err instanceof Error ? err.message : "Image upload failed." });
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (busy || uploading) return;
    setBusy(true);
    setPrepared(null);
    setNotice(null);
    const { image, section, ...fields } = form;
    void prepareNativeMarket({
      data: { ...fields, ...termsForSection(section), outcomes: outcomeList, tags, ...(image ? { image } : {}) },
    })
      .then((r) => {
        setPrepared(r);
        setNotice({
          tone: "info",
          text: "Terms saved. Not published yet. Continue with step 2.",
        });
      })
      .catch((err) =>
        setNotice({
          tone: "bad",
          text: err instanceof Error ? err.message : "Preparation failed.",
        }),
      )
      .finally(() => setBusy(false));
  }

  return (
    <div className="adm-stack">
      <Card title="Start from a draft">
        <p className="adm-muted">
          Football and Cricket matches are prepared on the Market engine page with their rules already written. Pick one
          there and it opens here.
        </p>
        <div className="adm-tabs">
          <Link to="/admin/$section" params={{ section: "engine" }} search={{ view: "fixtures" }} className="adm-btn">
            Football &amp; Cricket matches
          </Link>
          {templateTimes && (
            <button
              className="adm-btn"
              type="button"
              onClick={() => {
                setTemplateTimes(null);
                setFromEngine(false);
                setPrepared(null);
              }}
            >
              Use custom times
            </button>
          )}
        </div>
        {templateTimes && (
          <p className="adm-muted">
            {fromEngine ? "Draft from the Market engine. " : ""}UTC: {templateTimes.openAt.replace("T", " ")} to{" "}
            {templateTimes.closeAt.replace("T", " ")}. Times are locked to these rules. Prepare a fresh draft if the
            window is too close.
          </p>
        )}
      </Card>
      <Card title="Step 1 · Market details">
        <form
          style={{ display: "grid", gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="adm-tabs" role="group" aria-label="Market type" style={{ margin: 0 }}>
            <button
              type="button"
              className="adm-tab"
              aria-pressed={marketType === "binary"}
              disabled={busy}
              onClick={() => {
                setMarketType("binary");
                edit({ outcomes: "Yes,No" });
              }}
            >
              Binary (Yes / No)
            </button>
            <button
              type="button"
              className="adm-tab"
              aria-pressed={marketType === "multi"}
              disabled={busy}
              onClick={() => {
                setMarketType("multi");
                edit({
                  outcomes:
                    form.outcomes.includes(",") && form.outcomes !== "Yes,No"
                      ? form.outcomes
                      : "A,B,C",
                });
              }}
            >
              Multi-outcome (2 to 8)
            </button>
          </div>

          {FIELDS.map(({ key, label, rows }) => (
            <label className="adm-field" key={key}>
              {label}
              <textarea
                className="adm-textarea"
                required
                rows={rows}
                disabled={busy || (key === "outcomes" && marketType === "binary")}
                value={form[key]}
                onChange={(e) => edit({ [key]: e.target.value } as Partial<typeof form>)}
              />
            </label>
          ))}

          <div className="adm-field">
            Market picture (optional)
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {form.image ? (
                <img
                  src={form.image}
                  alt="Market picture preview"
                  width={64}
                  height={64}
                  style={{
                    borderRadius: 12,
                    objectFit: "cover",
                    border: "1px solid var(--adm-line)",
                  }}
                />
              ) : null}
              <label className="adm-btn" style={{ cursor: uploading ? "wait" : "pointer" }}>
                {uploading ? "Uploading…" : form.image ? "Change picture" : "Choose picture"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  disabled={busy || uploading}
                  onChange={(e) => {
                    void pickImage(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {form.image ? (
                <button
                  type="button"
                  className="adm-btn"
                  disabled={busy || uploading}
                  onClick={() => edit({ image: "" })}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <span className="adm-muted" style={{ fontSize: 12.5 }}>
              PNG, JPEG or WebP. Resized automatically. The picture is locked into the market terms
              with the rest of the metadata.
            </span>
          </div>

          <div className="adm-field">
            Section
            <div className="adm-tabs" role="group" aria-label="Section" style={{ margin: 0 }}>
              {SECTIONS.filter((name) => name !== "Crypto").map((name) => (
                <button
                  key={name}
                  type="button"
                  className="adm-tab"
                  aria-pressed={form.section === name}
                  disabled={busy}
                  onClick={() => edit({ section: name })}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <p className="adm-muted" style={{ margin: 0, fontSize: 12.5 }}>
            Outcomes: {outcomeList.length ? outcomeList.join(" · ") : "none"} (2 to 8, all
            different). Open and close times are set in step 2.
          </p>

          {problems.length > 0 ? (
            <Notice tone="warn">
              <b>Fix before saving</b>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Notice>
          ) : null}

          <div>
            <button
              type="submit"
              className="adm-btn adm-btn-primary"
              disabled={busy || uploading || outcomeList.length < 2 || problems.length > 0}
            >
              {busy ? "Saving…" : "Save market terms"}
            </button>
          </div>
        </form>

        {notice ? (
          <div style={{ marginTop: 14 }}>
            <Notice tone={notice.tone}>{notice.text}</Notice>
          </div>
        ) : null}

        {prepared ? (
          <dl className="adm-kv" style={{ marginTop: 14 }}>
            <dt>Terms ID</dt>
            <dd className="adm-mono">{prepared.metadataHash}</dd>
          </dl>
        ) : null}
      </Card>

      <Card title="Step 2 · Publish on Base">
        <NativeOperatorConsole
          key={templateTimes?.openAt ?? "custom"}
          initialTimes={templateTimes ?? undefined}
          prepared={prepared}
          outcomeCount={outcomeList.length || 2}
        />
      </Card>
    </div>
  );
}
