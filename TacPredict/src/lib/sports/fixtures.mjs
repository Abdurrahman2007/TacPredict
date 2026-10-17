/**
 * Pure parsing of football-data.org and CricketData.org responses into one fixture shape, and of
 * their results into a conservative resolution suggestion. Nothing here fetches anything or picks
 * a winner on its own: a "final" suggestion is evidence for the resolver to review, and anything
 * ambiguous comes back as "review".
 */
export const FOOTBALL_COMPETITIONS = [
  { code: "PD", name: "La Liga" },
  { code: "CL", name: "UEFA Champions League" },
];

const text = (v) => (typeof v === "string" ? v.trim() : "");
const goal = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
const placeholder = /\b(tbc|tbd|to be (confirmed|determined)|winner of|loser of)\b/i;

/** football-data.org competition matches -> fixtures that have not started. */
export function parseFootballFixtures(json, competitionName) {
  const matches = Array.isArray(json?.matches) ? json.matches : [];
  const out = [];
  for (const m of matches) {
    const id = m?.id;
    const home = text(m?.homeTeam?.name);
    const away = text(m?.awayTeam?.name);
    const startsAt = text(m?.utcDate);
    const status = text(m?.status);
    if (!Number.isInteger(id) || !home || !away || placeholder.test(home + away)) continue;
    if (!Number.isFinite(Date.parse(startsAt)) || !["SCHEDULED", "TIMED"].includes(status)) continue;
    out.push({
      sport: "football",
      provider: "football-data.org",
      matchId: String(id),
      competition: competitionName || text(m?.competition?.name) || "Football",
      home,
      away,
      startsAt: new Date(startsAt).toISOString(),
      status,
    });
  }
  return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** Score at the end of regulation time, or null when the provider does not give it clearly. */
export function regulationScore(match) {
  const s = match?.score;
  if (!s) return null;
  const regular = s.duration === "REGULAR" || s.duration === undefined ? s.fullTime : s.regularTime;
  const home = goal(regular?.home);
  const away = goal(regular?.away);
  return home === null || away === null ? null : { home, away };
}

/** Result suggestion for a football-data.org match object (or { match }). */
export function footballResult(json) {
  const m = json?.match ?? json;
  const status = text(m?.status);
  const evidence = {
    provider: "football-data.org",
    matchId: m?.id === undefined ? null : String(m.id),
    status,
    kickoff: text(m?.utcDate) || null,
    duration: m?.score?.duration ?? null,
    regulationScore: regulationScore(m),
    lastUpdated: text(m?.lastUpdated) || null,
  };
  if (["SCHEDULED", "TIMED", "IN_PLAY", "PAUSED", "LIVE"].includes(status))
    return { state: "pending", note: "The match is not finished.", evidence };
  if (status === "POSTPONED" || status === "CANCELLED")
    return { state: "void", note: `Provider status ${status}: the rules resolve this as VOID.`, evidence };
  if (status === "FINISHED") {
    const score = evidence.regulationScore;
    if (!score) return { state: "review", note: "Finished, but the regulation-time score is not clear. Check the official match report.", evidence };
    const winner = score.home > score.away ? "home" : score.home < score.away ? "away" : "draw";
    return { state: "final", winner, note: `Regulation-time score ${score.home}-${score.away}.`, evidence };
  }
  return { state: "review", note: `Provider status ${status || "unknown"} needs a manual check against the official report.`, evidence };
}

/** CricketData.org matches -> T20 fixtures (and Bangladesh ODIs) that have not started. */
export function parseCricketFixtures(json) {
  const rows = Array.isArray(json?.data) ? json.data : [];
  const out = [];
  for (const m of rows) {
    const id = text(m?.id);
    const teams = Array.isArray(m?.teams) ? m.teams.map(text) : [];
    const type = text(m?.matchType).toLowerCase();
    const raw = text(m?.dateTimeGMT);
    const startsAt = raw && !/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? `${raw}Z` : raw;
    if (!id || teams.length !== 2 || teams.some((t) => !t || placeholder.test(t))) continue;
    if (m?.matchStarted || m?.matchEnded || !Number.isFinite(Date.parse(startsAt))) continue;
    const bangladesh = teams.some((t) => /bangladesh/i.test(t));
    if (!(type === "t20" || (bangladesh && type === "odi"))) continue;
    const name = text(m?.name);
    const tail = name.includes(",") ? name.slice(name.lastIndexOf(",") + 1).trim() : "";
    out.push({
      sport: "cricket",
      provider: "cricketdata.org",
      matchId: id,
      competition: tail || type.toUpperCase(),
      home: teams[0],
      away: teams[1],
      startsAt: new Date(startsAt).toISOString(),
      status: text(m?.status) || "Match not started",
    });
  }
  return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** Result suggestion for a CricketData.org match_info response (or its data object). */
export function cricketResult(json) {
  const m = json?.data ?? json;
  const teams = Array.isArray(m?.teams) ? m.teams.map(text) : [];
  const status = text(m?.status);
  const evidence = {
    provider: "cricketdata.org",
    matchId: text(m?.id) || null,
    status,
    matchStarted: Boolean(m?.matchStarted),
    matchEnded: Boolean(m?.matchEnded),
    matchWinner: text(m?.matchWinner) || null,
    score: Array.isArray(m?.score) ? m.score : [],
    startsAt: text(m?.dateTimeGMT) || null,
  };
  if (/\b(no result|abandon|cancel|called off|washed out)/i.test(status))
    return { state: "void", note: `Provider status "${status}": the rules resolve this as VOID.`, evidence };
  if (!m?.matchEnded) return { state: "pending", note: "The match has not ended.", evidence };
  const named = evidence.matchWinner && teams.find((t) => t.toLowerCase() === evidence.matchWinner.toLowerCase());
  const fromText = teams.find((t) => status.toLowerCase().startsWith(`${t.toLowerCase()} won`));
  const winner = named || fromText;
  if (winner && !/\btie[d]?\b/i.test(status.replace(/\(.*?\)/g, "")))
    return { state: "final", winnerName: winner, note: `Provider result: ${status}`, evidence };
  return {
    state: "review",
    note: `The result text "${status}" is not a clean win. Ties and tie-breaks need a manual check against the official scorecard.`,
    evidence,
  };
}

/**
 * Turns a result suggestion into the on-chain proposal fields for a market whose outcome labels
 * are `labels` (football: home, Draw, away; cricket: team one, team two). Null means a person
 * has to decide: still pending, needs review, or the winner is not one of the outcomes.
 */
export function proposalFor(sport, result, labels) {
  if (!result || !Array.isArray(labels)) return null;
  if (result.state === "void") return { outcome: 0, voided: true };
  if (result.state !== "final") return null;
  if (sport === "football") {
    const index = { home: 0, draw: 1, away: 2 }[result.winner];
    return labels.length === 3 && index !== undefined ? { outcome: index, voided: false } : null;
  }
  const index = labels.findIndex((l) => l.trim().toLowerCase() === String(result.winnerName ?? "").toLowerCase());
  return index >= 0 ? { outcome: index, voided: false } : null;
}
