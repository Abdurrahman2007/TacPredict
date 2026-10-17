import type { SportsResult } from "./fixtures.mjs";

/** What the evidence checks return to the admin pages. */
export type EvidencePackage = {
  result: SportsResult | null;
  evidence: Record<string, unknown> | null;
  evidenceHash: string | null;
  observedAt: string | null;
  error: string | null;
};
