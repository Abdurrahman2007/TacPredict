export type HealthInput = {
  observedAt: bigint;
  checkpoint: bigint;
  head: bigint;
  indexedAt: bigint;
  headAt: bigint;
  finalized: bigint;
  maxAgeSeconds: number;
  paused: boolean;
  seeded: bigint;
  granted: bigint;
  cash: bigint;
  locked: bigint;
  fees: bigint;
  retired: bigint;
};
export function evaluateVirtualHealth(v: HealthInput) {
  const conservation = v.seeded + v.granted === v.cash + v.locked + v.fees + v.retired;
  const lagBlocks = v.head - v.checkpoint;
  const ageSeconds = v.headAt - v.indexedAt;
  const chainFresh =
    v.headAt <= v.observedAt + 30n && v.observedAt - v.headAt <= BigInt(v.maxAgeSeconds);
  const fresh =
    chainFresh && lagBlocks >= 0n && ageSeconds >= 0n && ageSeconds <= BigInt(v.maxAgeSeconds);
  const finalityValid = v.finalized <= v.checkpoint;
  const alerts: string[] = [];
  if (!conservation) alerts.push("ACCOUNTING_MISMATCH");
  if (!fresh) alerts.push("STALE_INDEXER");
  if (!finalityValid) alerts.push("INVALID_FINALITY");
  if (v.paused) alerts.push("CONTRACT_PAUSED");
  return {
    healthy: alerts.length === 0,
    conservation,
    fresh,
    finalityValid,
    paused: v.paused,
    lagBlocks: lagBlocks.toString(),
    ageSeconds: ageSeconds.toString(),
    alerts,
  };
}
