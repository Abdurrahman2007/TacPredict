import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UNIT,
  defaultFeedV1Policy,
  feedV1BuyPreview,
  feedV1ExecutionCents,
  feedV1ShareOdds,
  feedV1UpPpm,
  paperOutcome,
} from "../../../src/lib/paper/feed-v1-quote.ts";
import { futureWindows, lifecyclePlan } from "../../../src/lib/virtual/lifecycle.ts";
import { DISPLAY_DURATIONS } from "../../../src/lib/updown/window.mjs";

test("feed-v1: Up+Down sum to 100¢", () => {
  const q = feedV1ShareOdds(100_000, 100_000, 300, 5);
  assert.ok(q);
  assert.equal(q.up + q.down, 100);
  assert.ok(q.up >= 1 && q.up <= 99);
});

test("feed-v1: spot above strike raises Up", () => {
  const policy = defaultFeedV1Policy(5);
  const flat = feedV1UpPpm(100, 100, 300, policy);
  const up = feedV1UpPpm(101, 100, 300, policy);
  assert.ok(flat != null && up != null);
  assert.ok(up > flat);
});

test("feed-v1: less time increases certainty", () => {
  const policy = defaultFeedV1Policy(5);
  const early = feedV1UpPpm(101, 100, 3600, policy);
  const late = feedV1UpPpm(101, 100, 30, policy);
  assert.ok(early != null && late != null);
  assert.ok(late > early);
});

test("feed-v1: late 5m strongly favoured side can reach ~90–95¢ (not hardcoded)", () => {
  // +1% spot vs strike with ~21s left — adaptive σ; must not force a winner.
  const late = feedV1ShareOdds(101_000, 100_000, 21, 5);
  const flat = feedV1ShareOdds(100_000, 100_000, 21, 5);
  assert.ok(late && flat);
  assert.ok(late.up >= 90 && late.up <= 95, `expected ~90–95¢ got ${late.up}`);
  assert.equal(flat.up + flat.down, 100);
  assert.ok(flat.up >= 45 && flat.up <= 55);
  // Mild move earlier in the window stays well below late certainty.
  const early = feedV1ShareOdds(101_000, 100_000, 280, 5);
  assert.ok(early);
  assert.ok(early.up < late.up);
});

test("feed-v1: invalid / closed → null", () => {
  const policy = defaultFeedV1Policy(5);
  assert.equal(feedV1UpPpm(100, 100, 0, policy), null);
  assert.equal(feedV1ShareOdds(null, 100, 60), null);
});

test("feed-v1: ask ≥ mid ≥ bid", () => {
  const policy = defaultFeedV1Policy(5);
  const upPpm = feedV1UpPpm(100, 100, 300, policy);
  assert.ok(upPpm != null);
  const mid = Math.round(upPpm / 10_000);
  const ask = feedV1ExecutionCents(upPpm, "Up", 5_000_000, true, policy);
  const bid = feedV1ExecutionCents(upPpm, "Up", 5_000_000, false, policy);
  assert.ok(ask != null && bid != null);
  assert.ok(ask >= mid);
  assert.ok(bid <= mid);
});

test("feed-v1: buy preview to-win", () => {
  const p = feedV1BuyPreview(5, 50, 30);
  assert.ok(p);
  assert.ok(p.shares > 0);
  assert.ok(p.fee > 0);
  assert.ok(Math.abs(p.profitIfWin - (p.toWin - 5)) < 1e-6);
});

test("feed-v1: tie voids", () => {
  assert.equal(paperOutcome(100, 100, true), "void");
  assert.equal(paperOutcome(100, 101, true), "Up");
  assert.equal(paperOutcome(100, 99, true), "Down");
});

test("feed-v1: clip to [min, UNIT-min]", () => {
  const policy = { ...defaultFeedV1Policy(5), minProbabilityPpm: 10_000 };
  const extreme = feedV1UpPpm(200, 100, 1, policy);
  assert.ok(extreme != null);
  assert.ok(extreme >= 10_000);
  assert.ok(extreme <= UNIT - 10_000);
});

test("schedule: six durations including 30m", () => {
  assert.deepEqual([...DISPLAY_DURATIONS], [5, 15, 30, 60, 720, 1440]);
});

test("schedule: 4 assets × 6 intervals unique (XRP removed)", () => {
  const now = 1_700_000_000;
  const assets = ["BTC", "ETH", "SOL", "BNB"];
  const intervals = [300, 900, 1800, 3600, 43200, 86400];
  const keys = new Set();
  for (const asset of assets) {
    for (const interval of intervals) {
      for (const w of futureWindows(asset, interval, now, 3)) {
        assert.equal(keys.has(w.key), false);
        keys.add(w.key);
        assert.equal(w.closesAt - w.startsAt, interval);
      }
    }
  }
  assert.equal(keys.size, 4 * 6 * 3);
});

test("lifecycle: proposeFromFeed when closed with closing round", () => {
  const plan = lifecyclePlan(
    [
      {
        id: "1",
        startsAt: 900,
        closesAt: 950,
        resolutionDeadline: 2000,
        startCaptured: true,
        proposed: false,
        disputed: false,
        final: false,
        challengeUntil: null,
        startRound: "10",
        closingRound: "11",
      },
    ],
    1000,
  );
  assert.deepEqual(plan, [
    {
      marketId: "1",
      action: "proposeFromFeed",
      idempotencyKey: "1:proposeFromFeed",
      requiresSimulation: true,
      requiresAuthorizedSubmission: true,
    },
  ]);
});
