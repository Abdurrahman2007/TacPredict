import test from "node:test";
import assert from "node:assert/strict";
import { runFinalizedIndexer } from "../scripts/indexer-core.mjs";
test("scheduled indexer requires bounded work and refuses absent server configuration", async () => {
  for (const limit of [0, -1, 101, 1.5])
    await assert.rejects(runFinalizedIndexer({}, {}, limit), /work bound/);
  await assert.rejects(runFinalizedIndexer({}, {}, 2), /Missing/);
});
test("scheduled indexer rejects any other database or non-Base chain before requests", async () => {
  const env = {
    PROTOCOL_RPC_URL: "https://rpc.invalid",
    SUPABASE_URL: "https://other.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_local_fixture_only",
    PROTOCOL_CHAIN_ID: "8453",
  };
  await assert.rejects(runFinalizedIndexer(env, {}, 2), /Wrong main project/);
  await assert.rejects(
    runFinalizedIndexer(
      { ...env, SUPABASE_URL: "https://lmqaiqvwcytmgwgwyfwx.supabase.co", PROTOCOL_CHAIN_ID: "1" },
      {},
      2,
    ),
    /Unsupported chain/,
  );
});
