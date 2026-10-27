import test from "node:test";
import assert from "node:assert/strict";
import { createReadCoalescer } from "../../../src/lib/virtual/catalogue-coalescer.server.ts";

test("100 overlapping public reads share one authoritative read, not 100 RPC sequences", async () => {
  const read = createReadCoalescer();
  let calls = 0;
  const results = await Promise.all(
    Array.from({ length: 100 }, () =>
      read(["catalogue", "config-A", "rpc-A", "db-A"], async () => ({ block: ++calls })),
    ),
  );
  assert.equal(calls, 1);
  assert.ok(results.every((r) => r.block === 1));
});

test("completed values are not cached: the next read fetches a new block", async () => {
  const read = createReadCoalescer();
  let block = 100;
  const load = async () => ({ block: ++block });
  assert.equal((await read(["same"], load)).block, 101);
  assert.equal((await read(["same"], load)).block, 102);
});

test("errors fail all waiting callers and are never retained as a stale fallback", async () => {
  const read = createReadCoalescer();
  const error = Error("Provider unavailable");
  let calls = 0;
  const load = async () => { calls++; throw error; };
  const results = await Promise.allSettled([read(["same"], load), read(["same"], load)]);
  assert.equal(calls, 1);
  assert.ok(results.every((r) => r.status === "rejected" && r.reason === error));
  assert.equal(await read(["same"], async () => 7), 7);
});

test("deployment, RPC and database identity changes cannot reuse an old request", async () => {
  const read = createReadCoalescer();
  let calls = 0;
  const identities = [
    ["catalogue", "config-A", "rpc-A", "db-A"],
    ["catalogue", "config-B", "rpc-A", "db-A"],
    ["catalogue", "config-A", "rpc-B", "db-A"],
    ["catalogue", "config-A", "rpc-A", "db-B"],
  ];
  const values = await Promise.all(identities.map((key) => read(key, async () => ++calls)));
  assert.equal(new Set(values).size, 4);
});

test("identity serialization does not collide on concatenated strings or null", async () => {
  const read = createReadCoalescer();
  assert.deepEqual(await Promise.all([
    read(["ab", "c"], async () => 1),
    read(["a", "bc"], async () => 2),
    read([null], async () => 3),
    read(["null"], async () => 4),
  ]), [1, 2, 3, 4]);
});

test("bounded in-flight identities fail closed and release capacity after completion", async () => {
  const read = createReadCoalescer(1);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pending = read(["one"], () => gate);
  await assert.rejects(read(["two"], async () => 2), /busy/);
  release(1);
  assert.equal(await pending, 1);
  assert.equal(await read(["two"], async () => 2), 2);
});

test("invalid limits and empty identities are rejected without invoking a loader", async () => {
  for (const n of [0, -1, 1.5, 33, NaN]) assert.throws(() => createReadCoalescer(n));
  const read = createReadCoalescer();
  let calls = 0;
  await assert.rejects(read([], async () => ++calls), /identity/);
  assert.equal(calls, 0);
});
