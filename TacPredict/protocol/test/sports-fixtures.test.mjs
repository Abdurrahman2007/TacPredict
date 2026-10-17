import test from "node:test";
import assert from "node:assert/strict";
import {
  cricketResult,
  footballResult,
  parseCricketFixtures,
  parseFootballFixtures,
  proposalFor,
  regulationScore,
} from "../../src/lib/sports/fixtures.mjs";

// Payload shapes follow the providers' public API documentation; the values are test inputs only.
const fdMatch = (over = {}) => ({
  id: 1001,
  utcDate: "2026-10-19T19:00:00Z",
  status: "TIMED",
  homeTeam: { name: "Real Madrid CF" },
  awayTeam: { name: "FC Barcelona" },
  competition: { name: "Primera Division" },
  score: { winner: null, duration: "REGULAR", fullTime: { home: null, away: null } },
  ...over,
});

test("football fixtures: only scheduled matches with real teams, named by our competition label", () => {
  const rows = parseFootballFixtures(
    {
      matches: [
        fdMatch(),
        fdMatch({ id: 1002, status: "FINISHED" }),
        fdMatch({ id: 1003, homeTeam: { name: "Winner of Match 4" } }),
        fdMatch({ id: "x" }),
        fdMatch({ id: 1004, utcDate: "garbage" }),
      ],
    },
    "La Liga",
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    sport: "football",
    provider: "football-data.org",
    matchId: "1001",
    competition: "La Liga",
    home: "Real Madrid CF",
    away: "FC Barcelona",
    startsAt: "2026-10-19T19:00:00.000Z",
    status: "TIMED",
  });
});

test("football result uses regulation time, not extra time or penalties", () => {
  const regular = fdMatch({ status: "FINISHED", score: { winner: "AWAY_TEAM", duration: "REGULAR", fullTime: { home: 1, away: 2 } } });
  assert.deepEqual(footballResult(regular).winner, "away");
  const pens = fdMatch({
    status: "FINISHED",
    score: { winner: "HOME_TEAM", duration: "PENALTY_SHOOTOUT", fullTime: { home: 5, away: 4 }, regularTime: { home: 1, away: 1 } },
  });
  assert.deepEqual(regulationScore(pens), { home: 1, away: 1 });
  assert.equal(footballResult(pens).winner, "draw");
  const missing = fdMatch({ status: "FINISHED", score: { duration: "EXTRA_TIME", fullTime: { home: 2, away: 1 } } });
  assert.equal(footballResult(missing).state, "review");
});

test("football: postponed or cancelled is a void suggestion, live or odd statuses never decide", () => {
  assert.equal(footballResult(fdMatch({ status: "POSTPONED" })).state, "void");
  assert.equal(footballResult(fdMatch({ status: "CANCELLED" })).state, "void");
  assert.equal(footballResult(fdMatch({ status: "IN_PLAY" })).state, "pending");
  assert.equal(footballResult(fdMatch({ status: "SUSPENDED" })).state, "review");
  assert.equal(footballResult(fdMatch({ status: "AWARDED" })).state, "review");
});

const cdMatch = (over = {}) => ({
  id: "m-1",
  name: "Bangladesh vs India, 1st T20I",
  matchType: "t20",
  status: "Match not started",
  dateTimeGMT: "2026-10-20T13:30:00",
  teams: ["Bangladesh", "India"],
  matchStarted: false,
  matchEnded: false,
  ...over,
});

test("cricket fixtures: T20 and Bangladesh ODIs that have not started, time read as UTC", () => {
  const rows = parseCricketFixtures({
    data: [
      cdMatch(),
      cdMatch({ id: "m-2", matchType: "test" }),
      cdMatch({ id: "m-3", matchType: "odi", teams: ["Bangladesh", "Sri Lanka"] }),
      cdMatch({ id: "m-4", matchType: "odi", teams: ["India", "Sri Lanka"] }),
      cdMatch({ id: "m-5", matchStarted: true }),
      cdMatch({ id: "m-6", teams: ["India"] }),
      cdMatch({ id: "m-7", teams: ["TBC", "India"] }),
    ],
  });
  assert.deepEqual(rows.map((r) => r.matchId), ["m-1", "m-3"]);
  assert.equal(rows[0].startsAt, "2026-10-20T13:30:00.000Z");
  assert.equal(rows[0].competition, "1st T20I");
});

test("cricket result: clean wins are suggested, void states are void, ties go to a person", () => {
  const won = cricketResult({ data: cdMatch({ matchEnded: true, status: "India won by 5 wkts", matchWinner: "India" }) });
  assert.equal(won.state, "final");
  assert.equal(won.winnerName, "India");
  const text = cricketResult(cdMatch({ matchEnded: true, status: "Bangladesh won by 12 runs (DLS method)" }));
  assert.equal(text.winnerName, "Bangladesh");
  assert.equal(cricketResult(cdMatch({ matchEnded: true, status: "No result" })).state, "void");
  assert.equal(cricketResult(cdMatch({ matchEnded: true, status: "Match abandoned without a ball bowled" })).state, "void");
  assert.equal(cricketResult(cdMatch({ matchEnded: true, status: "Match tied" })).state, "review");
  assert.equal(cricketResult(cdMatch({ matchEnded: true, status: "Match tied (India won the one-over eliminator)" })).state, "review");
  assert.equal(cricketResult(cdMatch({ matchStarted: true, status: "India need 20 runs" })).state, "pending");
});

test("proposal maps a suggestion onto the market outcomes or stays empty", () => {
  const f = ["Real Madrid CF", "Draw", "FC Barcelona"];
  assert.deepEqual(proposalFor("football", { state: "final", winner: "draw", note: "", evidence: {} }, f), { outcome: 1, voided: false });
  assert.deepEqual(proposalFor("football", { state: "final", winner: "away", note: "", evidence: {} }, f), { outcome: 2, voided: false });
  assert.deepEqual(proposalFor("cricket", { state: "final", winnerName: "india", note: "", evidence: {} }, ["Bangladesh", "India"]), { outcome: 1, voided: false });
  assert.deepEqual(proposalFor("cricket", { state: "void", note: "", evidence: {} }, ["Bangladesh", "India"]), { outcome: 0, voided: true });
  assert.equal(proposalFor("cricket", { state: "review", note: "", evidence: {} }, ["A", "B"]), null);
  assert.equal(proposalFor("cricket", { state: "final", winnerName: "Nepal", note: "", evidence: {} }, ["A", "B"]), null);
  assert.equal(proposalFor("football", { state: "pending", note: "", evidence: {} }, f), null);
});
