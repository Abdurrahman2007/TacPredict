import type { PlannedWindow, VsetAsset } from "./schedule.mjs";

export declare const RULES_TEXT: string;
export declare const RULES_HASH: `0x${string}`;
export declare function sourceHashFor(asset: VsetAsset): `0x${string}`;
export declare function metadataUri(key: string): string;
export type MarketMetadata = {
  v: 1;
  kind: "updown-window";
  key: string;
  asset: VsetAsset;
  product: string;
  minutes: number;
  startSec: number;
  endSec: number;
  outcomes: ["Up", "Down"];
  currency: "Virtual USDC";
  rules: string;
};
export declare function marketMetadata(key: string): MarketMetadata;
export type FactoryTerms = {
  salt: `0x${string}`;
  metadataHash: `0x${string}`;
  rulesHash: `0x${string}`;
  sourceHash: `0x${string}`;
  outcomes: number;
  openAt: bigint;
  closeAt: bigint;
  resolveAfter: bigint;
  resolutionDeadline: bigint;
};
export declare function marketTerms(window: PlannedWindow): {
  terms: FactoryTerms;
  metadataURI: string;
  metadata: MarketMetadata;
};
export declare function evidenceHashFor(evidence: unknown): `0x${string}`;
