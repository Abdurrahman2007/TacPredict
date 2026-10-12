import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGamma, runMarketDiscovery } from "../../src/lib/agent/import-core.mjs";
const now = Date.now();
const market = (id) => ({
  id,
  question: "Will this event satisfy the official result?",
  active: true,
  closed: false,
  endDate: new Date(now + 86400000).toISOString(),
  outcomes: '["Yes","No"]',
  description: "Resolves according to the official final result published before the deadline.",
});
test("category hint is validated before policy checks", () => {
  const c = normalizeGamma(market("1"), now, ["Technology"], "Technology");
  assert.equal(c.category, "Technology");
  assert.equal(c.status, "REVIEW_REQUIRED");
  assert.equal(normalizeGamma(market("2"), now, ["Sports"], "Technology").status, "REJECTED");
});
test("worker produces bounded mixed-category candidates and isolates provider failure", async () => {
  let persisted = [];
  const fakeFetch = async (url, opts) => {
    if (url.includes("claim_market_import_run"))
      return Response.json({
        offset: 0,
        categories: ["Crypto", "Sports", "News", "Technology", "Business"],
      });
    if (url.includes("persist_market_candidates")) {
      persisted = JSON.parse(opts.body)._items;
      return Response.json(null);
    }
    if (url.includes("finish_market_import_run")) return Response.json(null);
    if (url.includes("gamma-api")) {
      const tag = new URL(url).searchParams.get("tag_id");
      if (tag === "1") return new Response("", { status: 503 });
      return Response.json(
        Array.from({ length: 10 }, (_, i) => ({
          id: `${tag}-${i}`,
          slug: `event-${tag}-${i}`,
          markets: [market(`${tag}-${i}`)],
        })),
      );
    }
    throw Error("unexpected endpoint");
  };
  const result = await runMarketDiscovery(
    { SUPABASE_URL: "https://lmqaiqvwcytmgwgwyfwx.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
    { fetch: fakeFetch },
  );
  assert.equal(result.status, "PARTIAL");
  assert.equal(persisted.length, 24);
  assert.deepEqual([...new Set(persisted.map((c) => c.category))].sort(), [
    "Business",
    "Crypto",
    "News",
    "Sports",
    "Technology",
  ]);
  assert.ok(persisted.some((c) => c.validation.discoveryTopic === "Football"));
  assert.ok(persisted.some((c) => c.validation.discoveryTopic === "Politics"));
  assert.ok(
    persisted.every((c) => c.status === "REVIEW_REQUIRED" && c.validation.sourceVerified === false),
  );
});
