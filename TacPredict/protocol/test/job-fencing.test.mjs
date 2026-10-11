import test from "node:test";
import assert from "node:assert/strict";
import { withProtocolLease, safeError } from "../scripts/job-client.mjs";
test("a second writer does no work when acquisition is denied", async () => {
  let worked = false;
  await withProtocolLease(
    async (r) => {
      assert.equal(r, "rpc/acquire_protocol_job_lease");
      return false;
    },
    84532,
    "indexer",
    async () => {
      worked = true;
    },
  );
  assert.equal(worked, false);
});
test("successful lease owner fences work and records completion before release", async () => {
  const calls = [];
  const db = async (r, b) => {
    calls.push({ r, b });
    if (r === "protocol_job_runs") return [{ id: "local-run" }];
    return true;
  };
  await withProtocolLease(db, 84532, "indexer", async (lease) => {
    assert(lease.owner);
    await lease.assert();
  });
  assert.equal(calls.at(-1).r, "rpc/release_protocol_job_lease");
  assert(calls.some((c) => c.r === "rpc/finish_protocol_job_run" && c.b._status === "SUCCESS"));
  assert.equal(new Set(calls.filter((c) => c.b._owner).map((c) => c.b._owner)).size, 1);
});
test("expired fencing halts writes and records failed run", async () => {
  const calls = [];
  const db = async (r, b) => {
    calls.push({ r, b });
    if (r === "protocol_job_runs") return [{ id: "local-run" }];
    return r !== "rpc/renew_protocol_job_lease";
  };
  await assert.rejects(
    withProtocolLease(db, 84532, "indexer", async (lease) => {
      await lease.assert();
    }),
    /lease lost/,
  );
  assert(calls.some((c) => c.r === "rpc/finish_protocol_job_run" && c.b._status === "FAILED"));
  assert.equal(calls.at(-1).r, "rpc/release_protocol_job_lease");
});
test("server keys and private RPC endpoint values never enter error output", () => {
  const env = {
    SUPABASE_SERVICE_ROLE_KEY: "local-secret-fixture",
    PROTOCOL_RPC_URL: "https://example.invalid/private-test-endpoint",
  };
  const s = safeError(
    new Error("failed local-secret-fixture https://example.invalid/private-test-endpoint"),
    env,
  );
  assert(!s.includes("local-secret-fixture"));
  assert(!s.includes("/private-test-endpoint"));
});
