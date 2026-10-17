/**
 * What the evidence checks return to the admin pages. Plain strings only, so it passes through
 * server functions unchanged: `evidenceText` is the exact text the hash was calculated from.
 */
export type EvidencePackage = {
  state: "pending" | "final" | "void" | "review" | null;
  winner: "home" | "away" | "draw" | null;
  winnerName: string | null;
  /** Up or Down for a crypto window. */
  outcome: string | null;
  note: string | null;
  evidenceText: string | null;
  evidenceHash: string | null;
  observedAt: string | null;
  error: string | null;
};

export const noEvidence = (error: string): EvidencePackage => ({
  state: null,
  winner: null,
  winnerName: null,
  outcome: null,
  note: null,
  evidenceText: null,
  evidenceHash: null,
  observedAt: null,
  error,
});
