/** Pure, bounded keeper planner. No signer, scheduler registration or production mutation. */
export type LifecycleMarket = {
  id: string;
  startsAt: number;
  closesAt: number;
  resolutionDeadline: number;
  startCaptured: boolean;
  proposed: boolean;
  disputed: boolean;
  final: boolean;
  challengeUntil: number | null;
  startRound: string | null;
  closingRound: string | null;
};
export function lifecyclePlan(markets: LifecycleMarket[], now: number) {
  if (!Number.isSafeInteger(now) || markets.length > 200)
    throw Error("Bounded lifecycle observation required");
  const ids = new Set<string>();
  return markets.flatMap((m) => {
    if (
      !/^[1-9]\d*$/.test(m.id) ||
      ids.has(m.id) ||
      ![m.startsAt, m.closesAt, m.resolutionDeadline].every(Number.isSafeInteger) ||
      m.startsAt >= m.closesAt ||
      m.closesAt >= m.resolutionDeadline
    )
      throw Error("Invalid lifecycle catalogue");
    ids.add(m.id);
    let action: string | null = null;
    if (!m.final) {
      if (now >= m.resolutionDeadline) action = "timeoutVoid";
      else if (!m.startCaptured && now >= m.startsAt && now < m.closesAt && m.startRound)
        action = "captureStart";
      else if (m.startCaptured && now >= m.closesAt && !m.proposed && m.closingRound)
        action = "proposeFromFeed";
      else if (m.proposed && !m.disputed && m.challengeUntil !== null && now >= m.challengeUntil)
        action = "finalize";
    }
    return action
      ? [
          {
            marketId: m.id,
            action,
            idempotencyKey: `${m.id}:${action}`,
            requiresSimulation: true,
            requiresAuthorizedSubmission: true,
          },
        ]
      : [];
  });
}
/** Deterministic future UTC windows. Caller must attach frozen rules, feed policy and approved budget. */
export function futureWindows(asset: string, intervalSeconds: number, now: number, count: number) {
  if (
    !["BTC", "ETH", "SOL", "BNB"].includes(asset) ||
    ![300, 900, 1800, 3600, 43200, 86400].includes(intervalSeconds) ||
    !Number.isSafeInteger(now) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 24
  )
    throw Error("Invalid series");
  const first = (Math.floor(now / intervalSeconds) + 1) * intervalSeconds;
  return Array.from({ length: count }, (_, i) => ({
    asset,
    startsAt: first + i * intervalSeconds,
    closesAt: first + (i + 1) * intervalSeconds,
    key: `${asset}:${intervalSeconds}:${first + i * intervalSeconds}`,
  }));
}
