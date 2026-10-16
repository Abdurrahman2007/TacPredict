import { useMemo, useState } from "react";
import { NativeOperatorConsole } from "@/components/native-operator-console";
import { prepareNativeMarket, uploadMarketImage } from "@/lib/protocol/admin.functions";
import { prepareMarketImage } from "@/lib/protocol/market-image-client";
import type { PreparedTerms } from "@/lib/protocol/operator-actions";
import { Card, Notice, PageHeader } from "../admin-ui";

const CATEGORIES = ["Crypto", "Sports", "News", "Technology", "Business", "Culture", "Other"] as const;

type FormKey = "title" | "description" | "outcomes" | "rules" | "source" | "sourceUrl";

const FIELDS: { key: FormKey; label: string; rows: number }[] = [
  { key: "title", label: "Title", rows: 1 },
  { key: "description", label: "Description / question detail", rows: 4 },
  { key: "outcomes", label: "Outcomes (comma-separated)", rows: 1 },
  { key: "rules", label: "Resolution criteria", rows: 4 },
  { key: "source", label: "Resolution source name", rows: 1 },
  { key: "sourceUrl", label: "Evidence / source URL (https)", rows: 1 },
];

/** Step 1 saves immutable terms in Supabase; step 2 publishes them with a wallet-signed Factory call. */
export function CreateMarket() {
  const [prepared, setPrepared] = useState<PreparedTerms | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "bad"; text: string } | null>(null);
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
    image: "",
  });
  const [uploading, setUploading] = useState(false);

  const outcomeList = useMemo(
    () =>
      form.outcomes
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    [form.outcomes],
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
    setBusy(true);
    setPrepared(null);
    setNotice(null);
    const { image, ...terms } = form;
    void prepareNativeMarket({
      data: { ...terms, outcomes: outcomeList, tags: [], ...(image ? { image } : {}) },
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
      <PageHeader
        title="Create market"
        subtitle="Step 1 saves the terms. Step 2 publishes them on Base with your wallet. Trading stays paused until you unpause it."
      />

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
                    form.outcomes.includes(",") && form.outcomes !== "Yes,No" ? form.outcomes : "A,B,C",
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
                  style={{ borderRadius: 12, objectFit: "cover", border: "1px solid var(--adm-line)" }}
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

          <label className="adm-field">
            Category
            <select
              className="adm-select"
              disabled={busy}
              value={form.category}
              onChange={(e) => edit({ category: e.target.value as (typeof CATEGORIES)[number] })}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>

          <p className="adm-muted" style={{ margin: 0, fontSize: 12.5 }}>
            Outcomes: {outcomeList.length ? outcomeList.join(" · ") : "none"} (2 to 8, all different).
            Open and close times are set in step 2.
          </p>

          <div>
            <button
              type="submit"
              className="adm-btn adm-btn-primary"
              disabled={busy || uploading || outcomeList.length < 2}
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
        <NativeOperatorConsole prepared={prepared} outcomeCount={outcomeList.length || 2} />
      </Card>
    </div>
  );
}
