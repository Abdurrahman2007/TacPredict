import test from "node:test";
import assert from "node:assert/strict";
import {
  LATEST_ATTEMPT_S,
  MAX_READING_AGE_S,
  boundaryFor,
  boundaryJobs,
  dueJobs,
  freshReadings,
  reportItems,
  runKeeper,
} from "../../src/lib/pool/keeper-core.mjs";
import { keeperEnv } from "../../src/lib/pool/keeper-env.mjs";
import { payoutFor, previewBet, scaledPrice, unreportedRefundDue } from "../../src/lib/pool/pool.mjs";

// 2026-10-19 00:00:00 UTC is a multiple of 24 hours.
const MIDNIGHT = Date.parse("2026-10-19T00:00:00Z") / 1000;

test("boundary lists only the rounds that really start or end there", () => {
  const five = boundaryJobs(MIDNIGHT + 300);
  assert.equal(five.length, 4 * 2, "4 coins x (start + end) for the 5 minute length only");
  assert.ok(five.every((j) => j.minutes === 5));
  const quarter = boundaryJobs(MIDNIGHT + 900);
  assert.equal(quarter.length, 4 * 2 * 2, "5 and 15 minute lengths");
  const day = boundaryJobs(MIDNIGHT + 86400);
  assert.equal(day.length, 4 * 2 * 4, "all four lengths meet at midnight");
  const end = day.find((j) => j.kind === "end" && j.minutes === 1440 && j.asset === "bitcoin");
  assert.equal(end.start, MIDNIGHT);
  const start = day.find((j) => j.kind === "start" && j.minutes === 1440 && j.asset === "bitcoin");
  assert.equal(start.start, MIDNIGHT + 86400);
  assert.equal(boundaryFor((MIDNIGHT + 437) * 1000), MIDNIGHT + 300);
});

const win = (over = {}) => ({ upPool: 5n, downPool: 7n, startPrice: 0n, endPrice: 0n, state: 0, ...over });

test("only rounds with bets that still miss a price are due", () => {
  const jobs = boundaryJobs(MIDNIGHT + 300);
  const start = jobs.find((j) => j.kind === "start" && j.asset === "bitcoin");
  const end = jobs.find((j) => j.kind === "end" && j.asset === "bitcoin");
  const windows = jobs.map(() => null);
  windows[jobs.indexOf(start)] = win();
  windows[jobs.indexOf(end)] = win({ startPrice: 100n });
  assert.deepEqual(dueJobs(jobs, windows), [start, end]);

  windows[jobs.indexOf(start)] = win({ startPrice: 100n }); // start price already posted
  windows[jobs.indexOf(end)] = win({ startPrice: 100n, endPrice: 90n }); // end price already posted
  assert.deepEqual(dueJobs(jobs, windows), []);

  windows[jobs.indexOf(start)] = win({ upPool: 0n, downPool: 0n }); // nobody bet
  windows[jobs.indexOf(end)] = win({ state: 2, startPrice: 100n }); // already refunded
  assert.deepEqual(dueJobs(jobs, windows), []);

  windows[jobs.indexOf(end)] = win(); // no start price: an end price must never be posted first
  assert.deepEqual(dueJobs(jobs, windows), []);
});

test("a reading counts only if it was taken at or after the boundary and soon enough", () => {
  const b = MIDNIGHT + 300;
  const body = {
    bitcoin: { usd: 67123.45, last_updated_at: b + 12 },
    ethereum: { usd: 2500.5, last_updated_at: b - 1 }, // taken before the boundary
    solana: { usd: 150.25, last_updated_at: b + MAX_READING_AGE_S + 1 }, // too late for the contract
    binancecoin: { usd: 0, last_updated_at: b + 5 }, // not a price
  };
  const out = freshReadings(body, ["bitcoin", "ethereum", "solana", "bnb"], b);
  assert.deepEqual(Object.keys(out), ["bitcoin"]);
  assert.equal(out.bitcoin.price, 6712345000000n);
  assert.equal(out.bitcoin.observedAt, b + 12);
  assert.equal(scaledPrice("67123.45"), 6712345000000n);
});

function fakes({ at, windows, bodies, failFetch = 0 }) {
  let clock = at * 1000;
  let fetches = 0;
  const sent = [];
  return {
    sent,
    deps: {
      nowMs: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      readWindows: async (jobs) => jobs.map((job) => windows(job)),
      fetchPrices: async () => {
        fetches += 1;
        if (fetches <= failFetch) throw Error("rate limited");
        return bodies(clock / 1000, fetches);
      },
      sendReports: async (payload) => {
        sent.push(payload);
        return ["0xhash"];
      },
    },
    fetches: () => fetches,
  };
}
const staked = (job) =>
  job.asset === "bitcoin" ? (job.kind === "start" ? win() : win({ startPrice: 6700000000000n })) : null;
const fresh = (b) => ({ bitcoin: { usd: 67123.45, last_updated_at: b + 20 } });

test("keeper posts the end price and the next start price from one fresh reading", async () => {
  const b = MIDNIGHT + 300;
  const f = fakes({ at: b + 30, windows: staked, bodies: () => fresh(b) });
  const result = await runKeeper({ ...f.deps, maxAttempts: 1 });
  assert.equal(result.status, "REPORTED");
  assert.equal(f.sent.length, 1);
  const [{ ends, starts }] = f.sent;
  assert.equal(ends.length, 1);
  assert.equal(starts.length, 1);
  assert.equal(ends[0].start, BigInt(b - 300), "the round that ends at the boundary");
  assert.equal(starts[0].start, BigInt(b), "the round that starts at the boundary");
  assert.equal(starts[0].price, 6712345000000n);
  assert.equal(starts[0].observedAt, BigInt(b + 20));
  assert.equal(starts[0].asset, 0);
  assert.equal(starts[0].duration, 300);
});

test("a stale reading is never posted; one look stops, polling waits for a fresh one", async () => {
  const b = MIDNIGHT + 300;
  const stale = (now, n) => ({ bitcoin: { usd: 67000, last_updated_at: n < 3 ? b - 30 : b + 41 } });
  const one = fakes({ at: b + 5, windows: staked, bodies: stale });
  const first = await runKeeper({ ...one.deps, maxAttempts: 1 });
  assert.equal(first.status, "NO_FRESH_PRICE");
  assert.equal(one.sent.length, 0);

  const polling = fakes({ at: b + 5, windows: staked, bodies: stale });
  const second = await runKeeper({ ...polling.deps });
  assert.equal(second.status, "REPORTED");
  assert.equal(polling.fetches(), 3);
  assert.equal(polling.sent[0].starts[0].observedAt, BigInt(b + 41));
});

test("a failing price feed does not crash the pass and posts nothing", async () => {
  const b = MIDNIGHT + 300;
  const f = fakes({ at: b + 10, windows: staked, bodies: () => fresh(b), failFetch: 99 });
  const result = await runKeeper({ ...f.deps, maxAttempts: 1, log: () => {} });
  assert.equal(result.status, "NO_FRESH_PRICE");
  assert.equal(f.sent.length, 0);
});

test("too late or nothing to do means no price lookup at all", async () => {
  const b = MIDNIGHT + 300;
  const late = fakes({ at: b + LATEST_ATTEMPT_S + 1, windows: staked, bodies: () => fresh(b) });
  assert.equal((await runKeeper({ ...late.deps, maxAttempts: 1 })).status, "TOO_LATE");
  assert.equal(late.fetches(), 0);
  const idle = fakes({ at: b + 10, windows: () => null, bodies: () => fresh(b) });
  assert.equal((await runKeeper({ ...idle.deps, maxAttempts: 1 })).status, "NOTHING_DUE");
  assert.equal(idle.fetches(), 0);
  assert.equal(idle.sent.length, 0);
});

test("report items carry exactly what the contract checks", () => {
  const jobs = boundaryJobs(MIDNIGHT + 300).filter((j) => j.asset === "solana");
  const items = reportItems(jobs, { solana: { price: 15025000000n, observedAt: MIDNIGHT + 310 } });
  assert.equal(items.length, 2);
  for (const item of items) {
    assert.equal(item.asset, 2);
    assert.equal(item.price, 15025000000n);
    assert.equal(typeof item.start, "bigint");
    assert.equal(typeof item.observedAt, "bigint");
  }
  assert.deepEqual(reportItems(jobs, {}), []);
});

test("keeper environment is checked without echoing the key", () => {
  const key = `0x${"11".repeat(32)}`;
  const pool = `0x${"22".repeat(20)}`;
  assert.match(keeperEnv({}).error, /POOL_REPORTER_PRIVATE_KEY/);
  assert.match(keeperEnv({ POOL_REPORTER_PRIVATE_KEY: key }).error, /UPDOWN_POOL_ADDRESS/);
  assert.match(keeperEnv({ POOL_REPORTER_PRIVATE_KEY: key, UPDOWN_POOL_ADDRESS: pool }).error, /BASE_PROTOCOL_RPC_URL/);
  const ok = keeperEnv({ POOL_REPORTER_PRIVATE_KEY: key, UPDOWN_POOL_ADDRESS: pool, BASE_PROTOCOL_RPC_URL: "https://rpc.example" });
  assert.equal(ok.pool, pool);
  assert.ok(!keeperEnv({ POOL_REPORTER_PRIVATE_KEY: "not-a-key" }).error.includes("not-a-key"));
});

test("the payout shown to players matches the contract formula", () => {
  // 100 on Up, 50 on Down, 3% of the losing side is the fee: winners share 48.5 on top of their stake.
  const winnersPool = 100_000000n;
  const losersPool = 50_000000n;
  assert.equal(payoutFor({ winnersPool, losersPool, feeBps: 300, stake: 10_000000n }), 14_850000n);
  assert.equal(payoutFor({ winnersPool, losersPool, feeBps: 0, stake: 10_000000n }), 15_000000n);
  // Nobody on the other side: only the stake comes back.
  assert.equal(payoutFor({ winnersPool, losersPool: 0n, feeBps: 300, stake: 10_000000n }), 10_000000n);
  // Rounding always goes down, never up.
  assert.equal(payoutFor({ winnersPool: 3n, losersPool: 1n, feeBps: 0, stake: 1n }), 1n);
  const preview = previewBet({ up: 90_000000n, down: 50_000000n, feeBps: 300, side: "up", stake: 10_000000n });
  assert.equal(preview.payout, 14_850000n);
  assert.equal(preview.opposed, true);
});

test("missed-reading refund becomes available only after the grace period", () => {
  const start = MIDNIGHT;
  const round = { state: 0, up: 5n, down: 5n, startPrice: 0n };
  assert.equal(unreportedRefundDue(round, start, 5, start + 299), false);
  assert.equal(unreportedRefundDue(round, start, 5, start + 301), true);
  const live = { ...round, startPrice: 100n };
  assert.equal(unreportedRefundDue(live, start, 5, start + 301), false, "start price posted: wait for the end");
  assert.equal(unreportedRefundDue(live, start, 5, start + 300 + 301), true);
  assert.equal(unreportedRefundDue({ ...round, up: 0n, down: 0n }, start, 5, start + 999), false, "no bets");
});
