import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  boundaryObservation,
  referenceObservation,
  observedCandles,
} from "../../src/lib/updown/chart-window.mjs";
import { historyWindows, historyState } from "../../src/lib/updown/round-history.mjs";
const src = (p) => readFileSync(new URL("../../src/" + p, import.meta.url), "utf8");
test("boundary labels need an exact, real, non-future observation", () => {
  assert.equal(
    boundaryObservation(
      [
        { time: 99, price: 10 },
        { time: 101, price: 11 },
      ],
      100,
      200,
    ),
    null,
  );
  assert.equal(
    boundaryObservation(
      [
        { time: 100, price: NaN },
        { time: 100, price: 0 },
      ],
      100,
      200,
    ),
    null,
  );
  assert.equal(boundaryObservation([{ time: 100, price: 10 }], 100, 99), null);
  assert.equal(
    boundaryObservation(
      [
        { time: 100, price: 10 },
        { time: 100, price: 12 },
      ],
      100,
      200,
    ),
    12,
  );
});
test("UTC history is aligned, bounded, newest first, and pages never overlap", () => {
  const now = Date.UTC(2026, 9, 22, 12, 44, 30);
  const rows = historyWindows(now, 5);
  assert.equal(rows.length, 8);
  assert.equal(rows[0].start, Date.UTC(2026, 9, 22, 12, 40));
  assert.ok(rows.every((w) => w.start % 300000 === 0 && w.end - w.start === 300000));
  const older = historyWindows(now, 5, rows.at(-1).start - 300000);
  assert.ok(older.every((w) => w.end <= rows.at(-1).start));
  assert.equal(historyWindows(now, 5, now + 86400000)[0].start, rows[0].start);
  assert.throws(() => historyWindows(now, 5, now, 13));
});
test("elapsed time never fabricates a settled or funded round", () => {
  const w = { start: 100, end: 200, minutes: 5 };
  const empty = { state: 0, result: 0, up: "0", down: "0", startPrice: "0" };
  assert.equal(historyState(null, w, 300), "Not created");
  assert.equal(historyState(empty, w, 300), "Not created");
  assert.equal(historyState({ ...empty, up: "1000000" }, w, 300), "Awaiting result");
  assert.equal(historyState({ ...empty, state: 1, result: 1 }, w, 300), "Up won");
  assert.equal(historyState({ ...empty, state: 2 }, w, 300), "Refunded");
});
test("cards stretch the real route link, retain direction links, and never invent cents", () => {
  const c = src("components/up-down-section.tsx"),
    css = src("styles/updown.css");
  assert.ok(c.includes("tp-card-hit"));
  assert.ok(css.includes(".tp-card-hit::after"));
  assert.ok(c.includes('cents(outcome) !== "Unavailable"'));
  assert.ok(c.includes("side: label.toLowerCase()"));
  assert.ok(c.includes("makeWindow(poolOn ? nextStart : start, minutes)"));
  assert.ok(!c.includes("Math.random"));
});
test("admin reads finalized on-chain rows without wallet signing or fabricated results", () => {
  const s = src("lib/pool/pool.server.ts").split("export async function poolRoundHistory")[1];
  assert.ok(s.includes('blockTag: "finalized"'));
  assert.ok(s.includes("blockNumber: block.number"));
  assert.ok(s.includes("readError: true"));
  assert.ok(!s.includes("writeContract"));
  const c = src("components/admin/views/round-history.tsx");
  for (const text of ["Date (UTC)", "Start · UTC", "End · UTC", "Schedule only"])
    assert.ok(c.includes(text));
});

test("reference start uses a real post-boundary sample in the grace period, never an earlier or late point", () => {
  assert.equal(
    referenceObservation(
      [
        { time: 99, price: 10 },
        { time: 110, price: 11 },
      ],
      100,
      200,
    ),
    11,
  );
  assert.equal(referenceObservation([{ time: 100, price: 10 }], 100, 99), null);
  assert.equal(referenceObservation([{ time: 180101, price: 10 }], 100, 200000), null);
});
test("sampled OHLC uses only actual observations, leaving empty buckets empty", () => {
  const points = [
    { time: 0, price: 10 },
    { time: 10000, price: 12 },
    { time: 20000, price: 9 },
    { time: 180000, price: 20 },
  ];
  assert.deepEqual(observedCandles(points, { start: 0, end: 240000, minutes: 4 }), [
    { time: 0, open: 10, high: 12, low: 9, close: 9 },
    { time: 180000, open: 20, high: 20, low: 20, close: 20 },
  ]);
});
test("detail metadata cannot block reference navigation", () => {
  const s = src("routes/up-down_.$asset.tsx");
  assert.ok(s.includes("void context.queryClient.prefetchQuery"));
  assert.ok(!s.includes("await context.queryClient.ensureQueryData"));
});
