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
  { key: "description", label: "Description", rows: 3 },
  { key: "outcomes", label: "Outcomes (comma-separated)", rows: 1 },
  { key: "rules", label: "Rules", rows: 4 },
  { key: "source", label: "Source", rows: 1 },
  { key: "sourceUrl", label: "Source URL", rows: 1 },
];

/**
 * Crypto comes first by coin (BTC, ETH, SOL, BNB) and fills itself in. Football and Cricket keep the
 * match form: step 1 saves immutable terms in Supabase, step 2 publishes them with a wallet-signed call.
 */
export function CreateMarket() {
  const [tab, setTab] = useState<"crypto" | "matches">(() => (hasDraft() ? "matches" : "crypto"));
  return (
    <div className="adm-stack">
      <PageHeader title="Create market" />
      <div className="adm-tabs" role="group" aria-label="Market kind" style={{ margin: 0 }}>
        <button
          type="button"
          className="adm-tab"
          aria-pressed={tab === "crypto"}
          onClick={() => setTab("crypto")}
        >
          Crypto Up / Down
        </button>
        <button
          type="button"
          className="adm-tab"
          aria-pressed={tab === "matches"}
          onClick={() => setTab("matches")}
        >
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
  const [manualTimes, setManualTimes] = useState<DraftTimes>({
    openAt: "",
    closeAt: "",
    resolveAfter: "",
    resolutionDeadline: "",
  });
  const activeTimes = templateTimes ?? manualTimes;
  const [tags, setTags] = useState<string[]>([]);
  const [fromEngine, setFromEngine] = useState(false);

  // A draft prepared on the Market engine page arrives here once, as plain form values.
  useEffect(() => {
    const draft: Draft | null = takeDraft();
    if (!draft) return;
    const section: Section =
      draft.subcategory === "Football"
        ? "Football"
        : draft.subcategory === "Cricket"
          ? "Cricket"
          : "Crypto";
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
              times: activeTimes,
            },
            Date.now(),
            { times: true },
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      form.title,
      form.outcomes,
      form.rules,
      form.sourceUrl,
      form.section,
      templateTimes,
      manualTimes,
    ],
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
      data: {
        ...fields,
        ...termsForSection(section),
        outcomes: outcomeList,
        tags,
        ...(image ? { image } : {}),
      },
    })
      .then((r) => {
        setPrepared(r);
        setNotice({
          tone: "info",
          text: "Saved. Review and sign to publish.",
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
      <div className="adm-inline">
        <Link
          to="/admin/$section"
          params={{ section: "engine" }}
          search={{ view: "fixtures" }}
          className="adm-btn"
        >
          Use sports draft
        </Link>
        {templateTimes && (
          <button
            className="adm-btn"
            onClick={() => {
              setTemplateTimes(null);
              setFromEngine(false);
              setPrepared(null);
            }}
          >
            Custom timing
          </button>
        )}
        {fromEngine && <span className="adm-caption">Draft loaded</span>}
      </div>
      <Card>
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

          {(["Basic Info", "Rules", "Timing", "Resolution", "Settings"] as const).map(
            (group, index) => (
              <fieldset className="adm-form-section" key={group}>
                <legend>
                  <span>{index + 1}</span>
                  {group}
                </legend>
                {group === "Timing" ? (
                  <>
                    <p className="adm-caption">UTC · betting closes before resolution</p>
                    <div className="adm-form-columns">
                      {(Object.keys(activeTimes) as (keyof DraftTimes)[]).map((key) => (
                        <label className="adm-field" key={key}>
                          {
                            {
                              openAt: "Opens",
                              closeAt: "Closes",
                              resolveAfter: "Resolve after",
                              resolutionDeadline: "Resolution deadline",
                            }[key]
                          }
                          <input
                            className="adm-input"
                            type="datetime-local"
                            required
                            readOnly={Boolean(templateTimes)}
                            disabled={busy}
                            value={activeTimes[key]}
                            onChange={(e) => {
                              setPrepared(null);
                              setManualTimes((t) => ({ ...t, [key]: e.target.value }));
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </>
                ) : group === "Settings" ? (
                  <>
                    <label className="adm-field">
                      Sport
                      <select
                        className="adm-input"
                        value={form.section}
                        disabled={busy}
                        onChange={(e) => edit({ section: e.target.value as Section })}
                      >
                        {SECTIONS.filter((n) => n !== "Crypto").map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                    <label className="adm-field">
                      Picture · optional
                      <input
                        type="file"
                        className="adm-input"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={busy || uploading}
                        onChange={(e) => {
                          void pickImage(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {form.image && (
                      <div className="adm-inline">
                        <img
                          src={form.image}
                          width={56}
                          height={56}
                          alt="Market preview"
                          style={{ borderRadius: 12, objectFit: "cover" }}
                        />
                        <button
                          className="adm-btn"
                          type="button"
                          onClick={() => edit({ image: "" })}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    <p className="adm-caption">
                      {uploading ? "Uploading…" : "Terms lock after publication."}
                    </p>
                  </>
                ) : (
                  FIELDS.filter((f) =>
                    group === "Basic Info"
                      ? ["title", "description", "outcomes"].includes(f.key)
                      : group === "Rules"
                        ? f.key === "rules"
                        : ["source", "sourceUrl"].includes(f.key),
                  ).map(({ key, label, rows }) => (
                    <label className="adm-field" key={key}>
                      {label}
                      {rows === 1 ? (
                        <input
                          className="adm-input"
                          type={key === "sourceUrl" ? "url" : "text"}
                          required
                          disabled={busy || (key === "outcomes" && marketType === "binary")}
                          value={form[key]}
                          onChange={(e) => edit({ [key]: e.target.value })}
                        />
                      ) : (
                        <textarea
                          className="adm-textarea"
                          required
                          rows={rows}
                          disabled={busy}
                          value={form[key]}
                          onChange={(e) => edit({ [key]: e.target.value })}
                        />
                      )}
                    </label>
                  ))
                )}
              </fieldset>
            ),
          )}

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
              disabled={
                busy ||
                uploading ||
                outcomeList.length < 2 ||
                problems.length > 0 ||
                !form.title.trim() ||
                !form.description.trim() ||
                !form.rules.trim() ||
                !form.source.trim() ||
                !form.sourceUrl.trim() ||
                Object.values(activeTimes).some((v) => !v)
              }
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

      <Card title="Review & publish">
        <NativeOperatorConsole
          key={JSON.stringify(activeTimes)}
          createOnly
          initialTimes={activeTimes}
          prepared={prepared}
          outcomeCount={outcomeList.length || 2}
        />
      </Card>
    </div>
  );
}
