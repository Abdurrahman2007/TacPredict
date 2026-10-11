/**
 * Draft-only AI market agent types and pure validators.
 * No network I/O, no DB writes, no chain calls — safe to import from UI/tests.
 */

export type MarketAgentCandidate = {
  title: string;
  description: string;
  category: "Crypto" | "Sports" | "News" | "Technology" | "Business" | "Culture" | "Other";
  outcomes: string[];
  rules: string;
  source: string;
  sourceUrl: string;
  openAtIso: string;
  closeAtIso: string;
  resolveAfterIso: string;
  resolutionDeadlineIso: string;
  confidence: number;
  ambiguity: number;
  risk: "LOW" | "MEDIUM" | "HIGH";
};

export type MarketAgentVerdict =
  | { ok: true; reasons: string[] }
  | { ok: false; reasons: string[] };

const vague = /\b(go up|go down|moon|pump|dump|soon|maybe|probably)\b/i;

/** Rule checks before a draft may enter a human/publisher queue. Never publishes. */
export function validateMarketCandidate(c: MarketAgentCandidate): MarketAgentVerdict {
  const reasons: string[] = [];
  if (c.title.trim().length < 5) reasons.push("Title too short");
  if (c.description.trim().length < 20) reasons.push("Description too short");
  if (c.rules.trim().length < 20) reasons.push("Resolution criteria too short");
  if (!/^https:\/\//.test(c.sourceUrl)) reasons.push("Source URL must be https");
  if (c.outcomes.length < 2 || c.outcomes.length > 8) reasons.push("Outcomes must be 2–8");
  if (new Set(c.outcomes.map((o) => o.trim().toLowerCase())).size !== c.outcomes.length)
    reasons.push("Outcome labels must be unique");
  if (vague.test(c.title) || vague.test(c.rules))
    reasons.push("Wording is ambiguous — require measurable threshold, source, and UTC deadline");
  const open = Date.parse(c.openAtIso);
  const close = Date.parse(c.closeAtIso);
  const resolveAfter = Date.parse(c.resolveAfterIso);
  const deadline = Date.parse(c.resolutionDeadlineIso);
  if (![open, close, resolveAfter, deadline].every(Number.isFinite))
    reasons.push("Invalid timing");
  else {
    if (!(open < close && close <= resolveAfter && resolveAfter < deadline))
      reasons.push("Require open < close ≤ resolveAfter < resolutionDeadline");
    if (deadline - resolveAfter < 86_400_000)
      reasons.push("Leave a full ≥24h window between resolveAfter and resolutionDeadline");
  }
  if (c.confidence < 0 || c.confidence > 1) reasons.push("confidence must be 0–1");
  if (c.ambiguity < 0 || c.ambiguity > 1) reasons.push("ambiguity must be 0–1");
  if (c.risk === "HIGH") reasons.push("HIGH risk requires human admin approval (not auto-publish)");
  if (reasons.length) return { ok: false, reasons };
  return {
    ok: true,
    reasons: ["Candidate passes draft gates; still not published on-chain"],
  };
}

/** AI must never invent a mid price — CLOB trades do. */
export function agentMaySetPrice(): false {
  return false;
}

/** AI must never pick the winning outcome — oracle + rules do. */
export function agentMayFinalizeOutcome(): false {
  return false;
}
