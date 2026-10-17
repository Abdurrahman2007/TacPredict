/**
 * Market engine drafts. A draft is only terms: it never invents a price, signs, settles or
 * enables trading. Anything the engine produces still has to be saved as locked terms and
 * published with a wallet that holds the market-creator role.
 *
 * Section rules are fixed here, before a market exists: crypto windows name their exact price
 * source and candles, and every Football / Cricket market names what happens when the match is
 * postponed, abandoned, tied or has no result. The on-chain VOID payout splits 1 USDC equally
 * across the outcomes (1/N per share); it is not a refund of the price paid, so the rules say so.
 */
import { ASSETS, DURATIONS, durationLabel } from "../updown/window.mjs";

const MIN = 60000;
const HOUR = 3600000;
const iso = (t) => new Date(t).toISOString();
const local = (t) => iso(t).slice(0, 16);

export const SPORTS = {
  football: {
    section: "Football",
    resolveAfterMs: 3 * HOUR,
    deadlineMs: 72 * HOUR,
    minLeadMs: 3 * HOUR,
  },
  cricket: {
    section: "Cricket",
    resolveAfterMs: 6 * HOUR,
    deadlineMs: 96 * HOUR,
    minLeadMs: 3 * HOUR,
  },
};

/** Draft for one Up/Down window on the UTC clock, e.g. BNB for 12 hours. */
export function cryptoWindowTemplate(asset, minutes, now = Date.now()) {
  const info = ASSETS[asset];
  if (!info || !DURATIONS.includes(minutes) || !Number.isFinite(now))
    throw Error("A supported asset, window length and a valid clock are required");
  const size = minutes * MIN;
  // At least two minutes to review before the next window boundary on the UTC clock.
  const start = Math.ceil((now + 2 * MIN) / size) * size;
  const end = start + size;
  const product = info.product;
  const rules = `UP wins if the close of the Coinbase Exchange ${product} 60-second candle starting at ${iso(end - MIN)} is greater than or equal to the open of the 60-second candle starting at ${iso(start)}. Otherwise DOWN wins. Window: [${iso(start)}, ${iso(end)}). Coinbase candle tuple is [time, low, high, open, close, volume], time in Unix seconds. Use exact UTC candle timestamps; do not substitute CoinGecko spot, another exchange or interpolated data. Missing, inconsistent or disputed source evidence must be reviewed under the native dispute/timeout-void rules; AI never chooses a winner. The resolver publishes independently reviewable evidence after close.`;
  return {
    title: `${info.name} Up or Down · ${durationLabel(minutes)} · ${iso(start)}`,
    description: `A ${durationLabel(minutes)} ${product} market using the Coinbase Exchange candles specified in the locked rules. Up includes equality. This is only prepared metadata until an authorized operator publishes the on-chain market.`,
    category: "Crypto",
    outcomes: "Up,Down",
    rules,
    source: `Coinbase Exchange ${product} 60-second candles`,
    sourceUrl: `https://api.exchange.coinbase.com/products/${product}/candles?granularity=60&start=${encodeURIComponent(iso(start))}&end=${encodeURIComponent(iso(end))}`,
    tags: ["up-down", info.short.toLowerCase()],
    times: {
      openAt: local(start),
      closeAt: local(end),
      resolveAfter: local(end + 5 * MIN),
      resolutionDeadline: local(end + 48 * HOUR),
    },
  };
}

const cleanName = (value) => String(value ?? "").replace(/[,\n\r]+/g, " ").replace(/\s+/g, " ").trim();

function checkFixture(fixture, sport, now) {
  if (!fixture || fixture.sport !== sport) throw Error(`Not a ${sport} fixture`);
  const home = cleanName(fixture.home);
  const away = cleanName(fixture.away);
  const competition = cleanName(fixture.competition);
  const matchId = String(fixture.matchId ?? "").trim();
  const kickoff = Date.parse(fixture.startsAt ?? "");
  if (!home || !away || home.toLowerCase() === away.toLowerCase()) throw Error("Both teams are required and must differ");
  if (!competition || !matchId || !/^[A-Za-z0-9_-]+$/.test(matchId)) throw Error("The fixture needs a competition and a provider match id");
  if (!Number.isFinite(kickoff) || !Number.isFinite(now)) throw Error("The fixture needs a valid start time");
  if (kickoff < now + SPORTS[sport].minLeadMs) throw Error("The match starts too soon to publish a market");
  return { home, away, competition, matchId, kickoff };
}

/** Rules text every football market carries. */
export function footballRules({ home, away, competition, matchId, kickoff, resolveAfter, deadline }) {
  return [
    `Match: ${home} vs ${away}, ${competition}, scheduled kick-off ${iso(kickoff)} (UTC). Provider match id ${matchId}.`,
    `Outcomes: "${home}" wins, Draw, or "${away}" wins, judged on the score at the end of regulation time (90 minutes plus stoppage time). Extra time and penalty shoot-outs do not count.`,
    `Draw: a level score at the end of regulation time resolves to Draw. That is a normal outcome, not a void.`,
    `Source: football-data.org match ${matchId}, checked against the competition's official match report.`,
    `Postponed: if the match is postponed, suspended, rescheduled or not played to a full result by ${iso(deadline)}, the market resolves VOID.`,
    `Abandoned: if the match is abandoned before regulation time ends and the competition does not officially award a result, the market resolves VOID.`,
    `Cancelled or no result: if the match is cancelled or has no official result, the market resolves VOID.`,
    `VOID payout: every outcome share redeems for 1/3 USDC (equal split across the three outcomes). This is not a refund of the price paid.`,
    `Timing: trading closes at kick-off. The resolver proposes the result after ${iso(resolveAfter)} with reviewable evidence. Anyone may dispute it during the challenge period by posting the bond, and an arbiter decides disputes. Backend automation and AI never choose or finalize a result.`,
  ].join("\n");
}

/** Rules text every cricket market carries. */
export function cricketRules({ home, away, competition, matchId, kickoff, resolveAfter, deadline }) {
  return [
    `Match: ${home} vs ${away}, ${competition}, scheduled start ${iso(kickoff)} (UTC). Provider match id ${matchId}.`,
    `Outcomes: "${home}" or "${away}", whichever team the official match result declares the winner.`,
    `Tied: if the scores are level and the official result is decided by a Super Over or the tie-break in the playing conditions, the team declared the winner wins. If the match is tied and no winner is declared, the market resolves VOID.`,
    `DLS and reduced overs: a result declared under DLS or a reduced-overs format counts if the official result names a winner.`,
    `Late start: a delayed start does not void the market if an official result is declared before ${iso(deadline)}.`,
    `Source: CricketData.org match ${matchId}, checked against the official scorecard of the competition.`,
    `Postponed: if the match is postponed, rescheduled or not completed by ${iso(deadline)}, the market resolves VOID.`,
    `Abandoned, no result or cancelled: the market resolves VOID.`,
    `VOID payout: every outcome share redeems for 1/2 USDC (equal split across the two outcomes). This is not a refund of the price paid.`,
    `Timing: trading closes at the scheduled start. The resolver proposes the result after ${iso(resolveAfter)} with reviewable evidence. Anyone may dispute it during the challenge period by posting the bond, and an arbiter decides disputes. Backend automation and AI never choose or finalize a result.`,
  ].join("\n");
}

function sportsTimes(kickoff, sport, now) {
  const rule = SPORTS[sport];
  const openAt = Math.ceil((now + 15 * MIN) / MIN) * MIN;
  const resolveAfter = kickoff + rule.resolveAfterMs;
  const deadline = kickoff + rule.deadlineMs;
  if (openAt >= kickoff) throw Error("The match starts too soon to publish a market");
  return { openAt, resolveAfter, deadline };
}

/** Draft for a football match from a normalized provider fixture. */
export function footballTemplate(fixture, now = Date.now()) {
  const f = checkFixture(fixture, "football", now);
  if (f.home.toLowerCase() === "draw" || f.away.toLowerCase() === "draw") throw Error("A team can not be called Draw");
  const t = sportsTimes(f.kickoff, "football", now);
  return {
    title: `${f.home} vs ${f.away} · ${f.competition}`,
    description: `Who wins ${f.home} vs ${f.away} (${f.competition}) after 90 minutes plus stoppage time: ${f.home}, Draw or ${f.away}. Trading closes at kick-off and the rules below cover postponed, abandoned and cancelled matches.`,
    category: "Sports",
    subcategory: "Football",
    outcomes: `${f.home},Draw,${f.away}`,
    rules: footballRules({ ...f, resolveAfter: t.resolveAfter, deadline: t.deadline }),
    source: "football-data.org",
    sourceUrl: `https://api.football-data.org/v4/matches/${f.matchId}`,
    tags: ["football", `fd-${f.matchId}`],
    times: {
      openAt: local(t.openAt),
      closeAt: local(f.kickoff),
      resolveAfter: local(t.resolveAfter),
      resolutionDeadline: local(t.deadline),
    },
  };
}

/** Draft for a cricket match from a normalized provider fixture. */
export function cricketTemplate(fixture, now = Date.now()) {
  const f = checkFixture(fixture, "cricket", now);
  const t = sportsTimes(f.kickoff, "cricket", now);
  return {
    title: `${f.home} vs ${f.away} · ${f.competition}`,
    description: `Which team wins ${f.home} vs ${f.away} (${f.competition}). Trading closes at the scheduled start and the rules below cover ties, rain, postponed, abandoned and no-result matches.`,
    category: "Sports",
    subcategory: "Cricket",
    outcomes: `${f.home},${f.away}`,
    rules: cricketRules({ ...f, resolveAfter: t.resolveAfter, deadline: t.deadline }),
    source: "CricketData.org",
    sourceUrl: `https://api.cricapi.com/v1/match_info?id=${f.matchId}`,
    tags: ["cricket", `cd-${f.matchId}`],
    times: {
      openAt: local(t.openAt),
      closeAt: local(f.kickoff),
      resolveAfter: local(t.resolveAfter),
      resolutionDeadline: local(t.deadline),
    },
  };
}

const CLAUSES = {
  postponed: [/postpone/i, "what happens if the match is postponed"],
  abandoned: [/abandon/i, "what happens if the match is abandoned"],
  noResult: [/no result|cancel/i, "what happens with no result or a cancelled match"],
  voidPayout: [/void[\s\S]*1\/\d|1\/\d[\s\S]*void/i, "the VOID payout (1/N USDC per share)"],
};
const TIE_CLAUSE = {
  football: [/\bdraw\b/i, "what a level score means (Draw)"],
  cricket: [/\btie[d]?\b/i, "what happens if the match is tied"],
};

/** Names of the rule clauses a sports market must state; empty when all are present. */
export function missingSportsClauses(rules, sport) {
  const text = String(rules ?? "");
  const wanted = [...Object.values(CLAUSES), TIE_CLAUSE[sport] ?? TIE_CLAUSE.football];
  return wanted.filter(([re]) => !re.test(text)).map(([, label]) => label);
}

/** Market-engine check of times and rules. Returns human-readable problems; empty means ok. */
export function validateDraft(draft, now = Date.now(), { times: checkTimes = true } = {}) {
  const problems = [];
  const outcomes = String(draft.outcomes ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (outcomes.length < 2 || outcomes.length > 8 || new Set(outcomes.map((x) => x.toLowerCase())).size !== outcomes.length)
    problems.push("Outcomes must be 2 to 8 different labels.");
  if (String(draft.title ?? "").length < 5) problems.push("Title is too short.");
  if (String(draft.rules ?? "").length < 20) problems.push("Rules are too short.");
  if (!String(draft.sourceUrl ?? "").startsWith("https://")) problems.push("Source URL must start with https://.");
  const t = draft.times ?? {};
  const stamp = (x) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(x ?? "")) ? Date.parse(`${x}:00Z`) : NaN);
  const [open, close, after, deadline] = [t.openAt, t.closeAt, t.resolveAfter, t.resolutionDeadline].map(stamp);
  if (!checkTimes) {
    /* custom markets set their times when they are published */
  } else if (![open, close, after, deadline].every(Number.isFinite)) problems.push("All four times are required.");
  else {
    if (open < now) problems.push("Open time is already in the past.");
    if (!(close > open)) problems.push("Close time must be after the open time.");
    if (!(after >= close)) problems.push("Resolution can not start before the close time.");
    if (!(deadline > after)) problems.push("The resolution deadline must be after the resolve time.");
  }
  const sport = draft.subcategory === "Football" ? "football" : draft.subcategory === "Cricket" ? "cricket" : null;
  if (sport) for (const label of missingSportsClauses(draft.rules, sport)) problems.push(`Rules must state ${label}.`);
  if (/up or down/i.test(String(draft.title ?? "")) && !/coinbase/i.test(String(draft.rules ?? "")))
    problems.push("Up/Down rules must name the exact price source.");
  return problems;
}
