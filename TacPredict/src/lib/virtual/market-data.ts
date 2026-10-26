// Deterministic checks for captured source evidence. This does not fetch/authenticate a
// provider, submit an outcome or replace independent resolver review of the source.
export type ResolutionSpec = {
  sourceId: string;
  maxFetchAgeSeconds: number;
} & (
  | {
      kind: "crypto";
      asset: "BTC" | "ETH" | "SOL" | "XRP" | "BNB";
      intervalSeconds: 300 | 900 | 1800 | 3600 | 43200 | 86400;
      observationToleranceSeconds: number;
      tie: "down" | "void";
    }
  | {
      kind: "sports";
      sport: "football" | "cricket";
      eventId: string;
      draw: "third-outcome" | "void";
    }
);
export type SourceEvidence = {
  sourceId: string;
  sourceUrl: string;
  fetchedAt: number;
  payloadHash: string;
} & (
  | {
      kind: "crypto";
      asset: string;
      open: { timestamp: number; priceAtoms: string };
      close: { timestamp: number; priceAtoms: string };
    }
  | {
      kind: "sports";
      sport: string;
      eventId: string;
      status: string;
      finishedAt: number;
      winner: "home" | "away" | "draw" | "none";
    }
);
export function validateResolutionSpec(s: ResolutionSpec, category: string, outcomes: number) {
  if (
    !s.sourceId?.trim() ||
    !Number.isInteger(s.maxFetchAgeSeconds) ||
    s.maxFetchAgeSeconds < 1 ||
    s.maxFetchAgeSeconds > 86400
  )
    throw Error("Explicit data-source freshness policy required");
  if (s.kind === "crypto") {
    if (
      category !== "Crypto" ||
      outcomes !== 2 ||
      !["BTC", "ETH", "SOL", "XRP", "BNB"].includes(s.asset) ||
      ![300, 900, 1800, 3600, 43200, 86400].includes(s.intervalSeconds) ||
      !Number.isInteger(s.observationToleranceSeconds) ||
      s.observationToleranceSeconds < 0 ||
      s.observationToleranceSeconds > s.intervalSeconds ||
      !["down", "void"].includes(s.tie)
    )
      throw Error("Invalid crypto resolution policy");
  } else if (
    s.kind !== "sports" ||
    category !== "Sports" ||
    !["football", "cricket"].includes(s.sport) ||
    !s.eventId?.trim() ||
    !["third-outcome", "void"].includes(s.draw) ||
    outcomes !== (s.draw === "third-outcome" ? 3 : 2)
  )
    throw Error("Invalid sports resolution policy");
}
export function validateMarketEvidence(
  s: ResolutionSpec,
  e: SourceEvidence,
  opens: number,
  closes: number,
  now: number,
) {
  validateResolutionSpec(
    s,
    s.kind === "crypto" ? "Crypto" : "Sports",
    s.kind === "crypto" ? 2 : s.draw === "third-outcome" ? 3 : 2,
  );
  if (
    ![opens, closes, now, e.fetchedAt].every(Number.isSafeInteger) ||
    opens >= closes ||
    now < closes ||
    e.fetchedAt > now ||
    now - e.fetchedAt > s.maxFetchAgeSeconds ||
    e.sourceId !== s.sourceId ||
    !/^0x[0-9a-fA-F]{64}$/.test(e.payloadHash) ||
    !e.sourceUrl.startsWith("https://")
  )
    throw Error("Missing, stale or mismatched source evidence");
  if (s.kind === "crypto" && e.kind === "crypto") {
    if (e.asset !== s.asset || closes - opens !== s.intervalSeconds)
      throw Error("Wrong crypto asset/window");
    for (const [sample, target] of [
      [e.open, opens],
      [e.close, closes],
    ] as const) {
      if (
        !Number.isSafeInteger(sample.timestamp) ||
        sample.timestamp > now ||
        sample.timestamp > e.fetchedAt ||
        Math.abs(sample.timestamp - target) > s.observationToleranceSeconds ||
        !/^\d{1,78}$/.test(sample.priceAtoms) ||
        BigInt(sample.priceAtoms) <= 0n
      )
        throw Error("Invalid or stale boundary price");
    }
    const a = BigInt(e.open.priceAtoms),
      b = BigInt(e.close.priceAtoms);
    return b === a && s.tie === "void"
      ? { voided: true, winner: 0 }
      : { voided: false, winner: b > a ? 0 : 1 };
  }
  if (s.kind === "sports" && e.kind === "sports") {
    if (
      e.sport !== s.sport ||
      e.eventId !== s.eventId ||
      e.status !== "completed" ||
      !Number.isSafeInteger(e.finishedAt) ||
      e.finishedAt > now ||
      e.finishedAt < opens ||
      e.fetchedAt < e.finishedAt
    )
      throw Error("Sports result not final or wrong fixture");
    if (e.winner === "none")
      throw Error("No official winner; unresolved/abandoned fixtures need the frozen void rule");
    if (e.winner === "draw")
      return s.draw === "void" ? { voided: true, winner: 0 } : { voided: false, winner: 2 };
    if (e.winner !== "home" && e.winner !== "away") throw Error("Invalid official result");
    return { voided: false, winner: e.winner === "home" ? 0 : 1 };
  }
  throw Error("Wrong source evidence kind");
}
