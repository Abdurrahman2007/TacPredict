import { COPY_BUCKET, COPY_FILE } from "./series-copy.mjs";

export type SeriesCopy = Record<string, { title: string; description: string }>;

/** Public JSON file in Supabase Storage. No database migration is needed to keep it. */
export async function readSeriesCopy(): Promise<SeriesCopy> {
  const base = process.env["SUPABASE_URL"];
  if (!base) return {};
  try {
    const response = await fetch(`${base}/storage/v1/object/public/${COPY_BUCKET}/${COPY_FILE}?t=${Math.floor(Date.now() / 15000)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return {};
    const json = (await response.json()) as unknown;
    if (!json || typeof json !== "object") return {};
    const out: SeriesCopy = {};
    for (const [asset, row] of Object.entries(json as Record<string, unknown>)) {
      const r = row as { title?: unknown; description?: unknown } | null;
      if (r && typeof r.title === "string" && typeof r.description === "string")
        out[asset] = { title: r.title, description: r.description };
    }
    return out;
  } catch {
    return {};
  }
}

export async function writeSeriesCopy(asset: string, copy: { title: string; description: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const current = await readSeriesCopy();
  const next = { ...current, [asset]: copy };
  const body = new Blob([JSON.stringify(next)], { type: "application/json" });
  const upload = () =>
    supabaseAdmin.storage.from(COPY_BUCKET).upload(COPY_FILE, body, {
      contentType: "application/json",
      upsert: true,
      cacheControl: "0",
    });
  let result = await upload();
  if (result.error && /bucket not found/i.test(result.error.message)) {
    const created = await supabaseAdmin.storage.createBucket(COPY_BUCKET, {
      public: true,
      fileSizeLimit: 65536,
      allowedMimeTypes: ["application/json"],
    });
    if (created.error && !/already exists/i.test(created.error.message))
      throw Error("Storage for series text is not available. Please try again.");
    result = await upload();
  }
  if (result.error) throw Error("The text could not be saved. Please try again.");
  return next;
}
