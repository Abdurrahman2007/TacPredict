/**
 * Price reporter for UpDownPool. At every UTC boundary that is a multiple of 5 minutes it:
 *  1. finds the rounds that start or end at that boundary and still need a price (read from the chain),
 *  2. waits for a CoinGecko reading that was really taken at or after the boundary,
 *  3. posts the readings with one transaction for ends and one for starts.
 * It only reports prices. It cannot move funds, change a bet or finalize anything else: the contract
 * checks every reading's time, and a missed reading simply refunds the round.
 */
import {
  COINGECKO_IDS,
  OBSERVE_WINDOW_S,
  POOL_ASSET_IDS,
  POOL_ASSET_KEYS,
  POOL_DURATIONS,
  REPORT_GRACE_S,
  scaledPrice,
} from "./pool.mjs";

/** Reports must land within REPORT_GRACE_S of the boundary; stop trying a little before that. */
export const LATEST_ATTEMPT_S = REPORT_GRACE_S - 40;
/** A reading must come from the first part of the observe window so the transaction has time to land. */
export const MAX_READING_AGE_S = OBSERVE_WINDOW_S - 20;

export const boundaryFor = (nowMs, stepSec = 300) => Math.floor(nowMs / 1000 / stepSec) * stepSec;

/** Every round that could need a report at this boundary: starts at the boundary, ends at the boundary. */
export function boundaryJobs(boundarySec) {
  const jobs = [];
  for (const asset of POOL_ASSET_KEYS)
    for (const minutes of POOL_DURATIONS) {
      const duration = minutes * 60;
      if (boundarySec % duration !== 0) continue;
      jobs.push({ kind: "start", asset, minutes, duration, start: boundarySec });
      jobs.push({ kind: "end", asset, minutes, duration, start: boundarySec - duration });
    }
  return jobs;
}

/** Keeps only the jobs the chain still needs. `windows[i]` is the on-chain round for `jobs[i]` (or null). */
export function dueJobs(jobs, windows) {
  return jobs.filter((job, i) => {
    const w = windows[i];
    if (!w || Number(w.state) !== 0) return false;
    const staked = BigInt(w.upPool) + BigInt(w.downPool) > 0n;
    if (!staked) return false;
    if (job.kind === "start") return BigInt(w.startPrice) === 0n;
    return BigInt(w.startPrice) > 0n && BigInt(w.endPrice) === 0n;
  });
}

/**
 * CoinGecko /simple/price answer -> { asset: { price (8 decimals), observedAt (s) } }, only for readings
 * that were taken at or after the boundary and are fresh enough for the contract.
 */
export function freshReadings(body, assets, boundarySec) {
  const out = {};
  for (const asset of assets) {
    const row = body?.[COINGECKO_IDS[asset]];
    const price = scaledPrice(row?.usd);
    const at = Number(row?.last_updated_at);
    if (price === null || !Number.isFinite(at)) continue;
    if (at >= boundarySec && at <= boundarySec + MAX_READING_AGE_S) out[asset] = { price, observedAt: at };
  }
  return out;
}

export function reportItems(jobs, readings) {
  return jobs
    .filter((job) => readings[job.asset])
    .map((job) => ({
      asset: POOL_ASSET_IDS[job.asset],
      duration: job.duration,
      start: BigInt(job.start),
      price: readings[job.asset].price,
      observedAt: BigInt(readings[job.asset].observedAt),
    }));
}

/**
 * One keeper pass. `maxAttempts: 1` makes it a single look (used by a once-a-minute Worker cron, which
 * simply tries again a minute later); the default keeps polling until the reading is fresh or time is up.
 * Dependencies are injected so the logic is testable without a network:
 *   readWindows(jobs) -> window[]            fetchPrices(assets) -> CoinGecko body
 *   sendReports({ ends, starts }) -> hashes  sleep(ms)
 */
export async function runKeeper({ nowMs, readWindows, fetchPrices, sendReports, sleep, pollMs = 10000, maxAttempts = Infinity, log = () => {} }) {
  const boundary = boundaryFor(nowMs());
  const lateBy = Math.floor(nowMs() / 1000) - boundary;
  if (lateBy > LATEST_ATTEMPT_S) return { status: "TOO_LATE", boundary };
  const jobs = boundaryJobs(boundary);
  if (!jobs.length) return { status: "NO_ROUNDS", boundary };
  const windows = await readWindows(jobs);
  const due = dueJobs(jobs, windows);
  if (!due.length) return { status: "NOTHING_DUE", boundary };
  const assets = [...new Set(due.map((job) => job.asset))];
  let readings = {};
  let attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      readings = freshReadings(await fetchPrices(assets), assets, boundary);
    } catch (error) {
      log(`price fetch failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
    if (assets.every((asset) => readings[asset])) break;
    if (attempts >= maxAttempts) break;
    if (Math.floor(nowMs() / 1000) - boundary > LATEST_ATTEMPT_S - pollMs / 1000) break;
    await sleep(pollMs);
  }
  const ready = due.filter((job) => readings[job.asset]);
  if (!ready.length) return { status: "NO_FRESH_PRICE", boundary, attempts, due: due.length };
  const ends = reportItems(ready.filter((job) => job.kind === "end"), readings);
  const starts = reportItems(ready.filter((job) => job.kind === "start"), readings);
  const hashes = await sendReports({ ends, starts });
  return { status: "REPORTED", boundary, attempts, ends: ends.length, starts: starts.length, skipped: due.length - ready.length, hashes };
}
