import test from "node:test";
import assert from "node:assert/strict";
import {
  cricketTemplate,
  cryptoWindowTemplate,
  footballTemplate,
  missingSportsClauses,
  validateDraft,
} from "../../src/lib/protocol/market-templates.mjs";

const NOW = Date.parse("2026-10-17T10:00:00Z");
const utc = (s) => Date.parse(`${s}:00Z`);

test("every asset and window length gives an aligned draft with exact Coinbase rules", () => {
  for (const asset of ["bitcoin", "ethereum", "solana", "bnb"])
    for (const minutes of [5, 15, 30, 60, 720, 1440]) {
      const d = cryptoWindowTemplate(asset, minutes, NOW);
      const start = utc(d.times.openAt);
      const end = utc(d.times.closeAt);
      assert.equal(end - start, minutes * 60000);
      assert.equal(start % (minutes * 60000), 0);
      assert.ok(start >= NOW + 120000);
      assert.equal(d.outcomes, "Up,Down");
      assert.match(d.rules, /Coinbase Exchange [A-Z]+-USD 60-second candle/);
      assert.ok(d.rules.includes("greater than or equal to"));
      assert.deepEqual(validateDraft(d, NOW), []);
    }
});
test("BNB uses BNB-USD and the title names the window", () => {
  const d = cryptoWindowTemplate("bnb", 720, NOW);
  assert.match(d.title, /^BNB Up or Down · 12 hours · /);
  assert.ok(d.sourceUrl.includes("/products/BNB-USD/candles"));
});
test("unsupported asset, length or clock is rejected", () => {
  assert.throws(() => cryptoWindowTemplate("doge", 5, NOW));
  assert.throws(() => cryptoWindowTemplate("bitcoin", 7, NOW));
  assert.throws(() => cryptoWindowTemplate("bitcoin", 5, NaN));
});

const football = {
  sport: "football",
  provider: "football-data.org",
  matchId: "544321",
  competition: "La Liga",
  home: "Real Madrid CF",
  away: "FC Barcelona",
  startsAt: "2026-10-19T19:00:00Z",
  status: "TIMED",
};
test("football draft: three outcomes, locked rules for every non-result case", () => {
  const d = footballTemplate(football, NOW);
  assert.equal(d.category, "Sports");
  assert.equal(d.subcategory, "Football");
  assert.equal(d.outcomes, "Real Madrid CF,Draw,FC Barcelona");
  assert.deepEqual(missingSportsClauses(d.rules, "football"), []);
  for (const word of ["Postponed", "Abandoned", "Draw", "Cancelled or no result", "1/3 USDC", "not a refund"])
    assert.ok(d.rules.includes(word), word);
  assert.ok(d.rules.includes("Extra time and penalty shoot-outs do not count"));
  assert.equal(d.times.closeAt, "2026-10-19T19:00");
  assert.equal(utc(d.times.resolveAfter) - utc(d.times.closeAt), 3 * 3600000);
  assert.ok(d.tags.includes("fd-544321"));
  assert.deepEqual(validateDraft(d, NOW), []);
});

const cricket = {
  sport: "cricket",
  provider: "cricketdata.org",
  matchId: "a1b2c3d4-0000-4000-8000-000000000001",
  competition: "Bangladesh vs India, 1st T20I",
  home: "Bangladesh",
  away: "India",
  startsAt: "2026-10-20T13:30:00Z",
  status: "Match not started",
};
test("cricket draft: two outcomes, tie, DLS, no-result and postponed all stated", () => {
  const d = cricketTemplate(cricket, NOW);
  assert.equal(d.subcategory, "Cricket");
  assert.equal(d.outcomes, "Bangladesh,India");
  assert.deepEqual(missingSportsClauses(d.rules, "cricket"), []);
  for (const word of ["Tied", "Super Over", "DLS", "Postponed", "no result", "1/2 USDC"])
    assert.ok(d.rules.includes(word) || d.rules.toLowerCase().includes(word.toLowerCase()), word);
  assert.equal(utc(d.times.resolutionDeadline) - utc(d.times.closeAt), 96 * 3600000);
  assert.deepEqual(validateDraft(d, NOW), []);
});

test("fixtures that are too close, malformed or lack an id are refused", () => {
  assert.throws(() => footballTemplate({ ...football, startsAt: "2026-10-17T11:00:00Z" }, NOW), /too soon/);
  assert.throws(() => footballTemplate({ ...football, away: "real madrid cf" }, NOW), /differ/);
  assert.throws(() => footballTemplate({ ...football, matchId: "../x" }, NOW));
  assert.throws(() => footballTemplate({ ...football, startsAt: "nope" }, NOW));
  assert.throws(() => cricketTemplate(football, NOW), /Not a cricket/);
});

test("the engine blocks sports rules that skip postponed, abandoned, tie or void clauses", () => {
  const d = footballTemplate(football, NOW);
  const weak = { ...d, rules: "Home team wins if they score more goals than the away team in the match." };
  const problems = validateDraft(weak, NOW);
  assert.ok(problems.length >= 4);
  assert.ok(missingSportsClauses(weak.rules, "football").length >= 4);
});

test("time checks catch past, reversed and missing times", () => {
  const d = cryptoWindowTemplate("bitcoin", 5, NOW);
  assert.ok(validateDraft(d, utc(d.times.openAt) + 1).some((p) => /past/.test(p)));
  assert.ok(validateDraft({ ...d, times: { ...d.times, closeAt: d.times.openAt } }, NOW).some((p) => /after the open/.test(p)));
  assert.ok(validateDraft({ ...d, times: { openAt: "", closeAt: "", resolveAfter: "", resolutionDeadline: "" } }, NOW).some((p) => /required/.test(p)));
});

test("custom drafts can skip the time check but sports rules are still enforced", () => {
  const d = footballTemplate(football, NOW);
  const custom = { ...d, times: undefined };
  assert.deepEqual(validateDraft(custom, NOW, { times: false }), []);
  const weak = { ...custom, rules: "Home wins if they score more goals in the match than the away team." };
  assert.ok(validateDraft(weak, NOW, { times: false }).some((p) => /postponed/i.test(p)));
});
