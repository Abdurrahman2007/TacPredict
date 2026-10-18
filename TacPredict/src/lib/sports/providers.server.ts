import { keccak256, stringToHex } from "viem";
import type { Fixture } from "@/lib/protocol/market-templates.mjs";
import {
  cricketResult,
  FOOTBALL_COMPETITIONS,
  footballResult,
  parseCricketFixtures,
  parseFootballFixtures,
} from "./fixtures.mjs";
import { canonicalJson, observedAtField } from "./evidence.mjs";
import { noEvidence, type EvidencePackage } from "./types";
import { ASSETS, DURATIONS, windowResult, type UpDownAsset } from "@/lib/updown/window.mjs";

/**
 * Server-side data providers for the market engine. Keys live in Worker secrets and never reach
 * the browser. Every function returns what the provider said, or an error message: nothing is
 * guessed, filled in or faked when a provider is missing or down.
 */
const FOOTBALL_BASE = "https://api.football-data.org/v4";
const CRICKET_BASE = "https://api.cricapi.com/v1";
const COINBASE = "https://api.exchange.coinbase.com";
const FOOTBALL_KEY = "FOOTBALL_DATA_API_KEY";
const CRICKET_KEY = "CRICKET_DATA_API_KEY";

export type ProviderInfo = {
  id: "coingecko" | "coinbase" | "football-data" | "cricketdata";
  role:
    | "Crypto charts"
    | "Crypto price oracle"
    | "Football fixtures and results"
    | "Cricket fixtures and results";
  name: string;
  configured: boolean;
  secret: string | null;
  note: string;
};

export function providerInfo(): ProviderInfo[] {
  return [
    {
      id: "coingecko",
      role: "Crypto charts",
      name: "CoinGecko",
      configured: Boolean(process.env["COINGECKO_DEMO_API_KEY"]),
      secret: "COINGECKO_DEMO_API_KEY",
      note: "BTC, ETH, SOL and BNB charts. Sampled display data only; not the locked Coinbase settlement oracle.",
    },
    {
      id: "coinbase",
      role: "Crypto price oracle",
      name: "Coinbase Exchange",
      configured: true,
      secret: null,
      note: "Public candles for BTC, ETH, SOL and BNB. No key needed.",
    },
    {
      id: "football-data",
      role: "Football fixtures and results",
      name: "football-data.org",
      configured: Boolean(process.env[FOOTBALL_KEY]),
      secret: FOOTBALL_KEY,
      note: "La Liga and UEFA Champions League. Free API token from football-data.org.",
    },
    {
      id: "cricketdata",
      role: "Cricket fixtures and results",
      name: "CricketData.org",
      configured: Boolean(process.env[CRICKET_KEY]),
      secret: CRICKET_KEY,
      note: "T20 and Bangladesh matches. Free API key from cricketdata.org (limited calls per day).",
    },
  ];
}

const saved = new Map<string, { expires: number; value: unknown }>();
async function getJson(
  url: string,
  headers: Record<string, string>,
  ttl: number,
): Promise<unknown> {
  const hit = saved.get(url);
  if (hit && hit.expires > Date.now()) return hit.value;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "TacPredict/1.0 (https://tacpredict.fun)",
      ...headers,
    },
    signal: AbortSignal.timeout(9000),
  });
  if (response.status === 401 || response.status === 403)
    throw Error("The provider refused the API key. Check the Worker secret.");
  if (response.status === 429)
    throw Error("The provider rate limit was reached. Try again in a minute.");
  if (!response.ok) throw Error(`The provider returned ${response.status}.`);
  const value = await response.json();
  saved.set(url, { expires: Date.now() + ttl, value });
  return value;
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function loadFootballFixtures(
  days: number,
): Promise<{ fixtures: Fixture[]; error: string | null }> {
  const key = process.env[FOOTBALL_KEY];
  if (!key)
    return { fixtures: [], error: `Not connected. Add ${FOOTBALL_KEY} as a Worker secret.` };
  const from = Date.now();
  const to = from + Math.min(10, Math.max(1, days)) * 86400000;
  const fixtures: Fixture[] = [];
  const errors: string[] = [];
  for (const competition of FOOTBALL_COMPETITIONS) {
    try {
      const json = await getJson(
        `${FOOTBALL_BASE}/competitions/${competition.code}/matches?dateFrom=${day(from)}&dateTo=${day(to)}`,
        { "x-auth-token": key },
        120000,
      );
      fixtures.push(...parseFootballFixtures(json, competition.name));
    } catch (error) {
      errors.push(`${competition.name}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }
  fixtures.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return { fixtures, error: errors.length ? errors.join(" ") : null };
}

export async function loadCricketFixtures(): Promise<{
  fixtures: Fixture[];
  error: string | null;
}> {
  const key = process.env[CRICKET_KEY];
  if (!key) return { fixtures: [], error: `Not connected. Add ${CRICKET_KEY} as a Worker secret.` };
  const fixtures: Fixture[] = [];
  try {
    for (const offset of [0, 25]) {
      const json = (await getJson(
        `${CRICKET_BASE}/matches?apikey=${encodeURIComponent(key)}&offset=${offset}`,
        {},
        600000,
      )) as {
        status?: string;
        reason?: string;
      };
      if (json?.status === "failure")
        throw Error(json.reason || "The provider returned a failure.");
      fixtures.push(...parseCricketFixtures(json));
    }
  } catch (error) {
    return { fixtures, error: error instanceof Error ? error.message : "failed" };
  }
  const seen = new Set<string>();
  const unique = fixtures.filter((f) => !seen.has(f.matchId) && seen.add(f.matchId));
  unique.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return { fixtures: unique, error: null };
}

const hashOf = (text: string) => keccak256(stringToHex(text));

export async function loadSportsResult(
  sport: "football" | "cricket",
  matchId: string,
  closeMs: number,
): Promise<EvidencePackage> {
  const secret = sport === "football" ? FOOTBALL_KEY : CRICKET_KEY;
  const key = process.env[secret];
  if (!key) return noEvidence(`Not connected. Add ${secret} as a Worker secret.`);
  try {
    const json =
      sport === "football"
        ? await getJson(
            `${FOOTBALL_BASE}/matches/${encodeURIComponent(matchId)}`,
            { "x-auth-token": key },
            20000,
          )
        : await getJson(
            `${CRICKET_BASE}/match_info?apikey=${encodeURIComponent(key)}&id=${encodeURIComponent(matchId)}`,
            {},
            20000,
          );
    const result = sport === "football" ? footballResult(json) : cricketResult(json);
    const text = canonicalJson({
      ...result.evidence,
      fetchedAt: new Date().toISOString(),
      suggestion: result.state,
    });
    return {
      state: result.state,
      winner: result.winner ?? null,
      winnerName: result.winnerName ?? null,
      outcome: null,
      note: result.note,
      evidenceText: text,
      evidenceHash: hashOf(text),
      observedAt: observedAtField(closeMs, Date.now()),
      error: null,
    };
  } catch (error) {
    return noEvidence(
      error instanceof Error ? error.message : "The provider could not be reached.",
    );
  }
}

type Row = [number, number, number, number, number, number];
async function candlesBetween(product: string, fromMs: number, toMs: number): Promise<Row[]> {
  const rows = await getJson(
    `${COINBASE}/products/${product}/candles?granularity=60&start=${new Date(fromMs).toISOString()}&end=${new Date(toMs).toISOString()}`,
    {},
    5000,
  );
  if (!Array.isArray(rows)) throw Error("Unexpected candle response.");
  return rows.filter(
    (r): r is Row => Array.isArray(r) && r.length >= 5 && r.every((x) => typeof x === "number"),
  );
}

/** Crypto oracle evidence: the two exact Coinbase candles the locked rules name. */
export async function loadCryptoEvidence(
  asset: UpDownAsset,
  startMs: number,
  minutes: number,
): Promise<EvidencePackage> {
  const info = ASSETS[asset];
  const size = minutes * 60000;
  const endMs = startMs + size;
  if (!DURATIONS.includes(minutes) || startMs % size !== 0)
    return noEvidence("That is not a valid window.");
  if (Date.now() < endMs + 60000) return noEvidence("The window has not finished yet.");
  try {
    const [first, last] = await Promise.all([
      candlesBetween(info.product, startMs, startMs + 60000),
      candlesBetween(info.product, endMs - 60000, endMs),
    ]);
    const open = first.find((r) => r[0] * 1000 === startMs);
    const close = last.find((r) => r[0] * 1000 === endMs - 60000);
    const candle = (r: Row) => ({
      time: new Date(r[0] * 1000).toISOString(),
      low: r[1],
      high: r[2],
      open: r[3],
      close: r[4],
    });
    const result = windowResult(
      [open, close].flatMap((r) =>
        r ? [{ time: r[0] * 1000, open: r[3], high: r[2], low: r[1], close: r[4] }] : [],
      ),
      { start: startMs, end: endMs, minutes },
    );
    if (!open || !close || !result)
      return noEvidence(
        "Coinbase has no candle for the start or the last minute. Do not propose a result; review it under the timeout-void rules.",
      );
    const text = canonicalJson({
      provider: "Coinbase Exchange",
      product: info.product,
      window: { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() },
      openCandle: candle(open),
      closeCandle: candle(close),
      rule: "UP if close of the last 60-second candle >= open of the first 60-second candle",
      outcome: result.outcome,
      fetchedAt: new Date().toISOString(),
    });
    return {
      state: "final",
      winner: null,
      winnerName: null,
      outcome: result.outcome,
      note: `Open ${result.open}, close ${result.close}: ${result.outcome}.`,
      evidenceText: text,
      evidenceHash: hashOf(text),
      observedAt: observedAtField(endMs, Date.now()),
      error: null,
    };
  } catch (error) {
    return noEvidence(error instanceof Error ? error.message : "Coinbase could not be reached.");
  }
}
