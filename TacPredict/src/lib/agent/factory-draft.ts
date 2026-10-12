/**
 * Maps an approved discovery candidate into a TacPredict-owned market draft.
 * Never copies Polymarket tokens, liquidity, CLOB books, or resolution results.
 * Never sets a live mid price — CLOB fills (or explicit initial liquidity) do that later.
 */

export type FactoryDraftInput = {
  id: string;
  source: string;
  source_market_id: string;
  title: string;
  category: string;
  proposed_rules: string;
  source_url: string;
  outcomes?: string[];
  close_at?: string;
  fingerprint?: string;
};

export type TacPredictFactoryDraft = {
  /** Own TacPredict identifier — never equal to Polymarket market id */
  proposedMarketKey: string;
  chainId: 8453;
  collateral: "USDC";
  collateralAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  tradingMechanism: "CLOB";
  title: string;
  category: string;
  outcomes: string[];
  rules: string;
  closeAt: string | null;
  sourceTracking: {
    provider: string;
    sourceMarketId: string;
    sourceUrl: string;
    candidateId: string;
  };
  pricePolicy: {
    livePriceFrom: "native-orders-only";
    polymarketOdds: "reference-metadata-only";
    fabricateOdds: false;
  };
  status: "DRAFT_NOT_PUBLISHED";
  requires: [
    "human-or-policy-approved-publisher",
    "factory-createMarket-simulation",
    "trusted-oracle-rules-lock",
    "own-usdc-collateral-config",
  ];
};

function slugPart(value: string, max = 24): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, max);
}

/** Pure factory mapper — no DB / chain I/O. Safe for admin UI preview. */
export function buildTacPredictFactoryDraft(input: FactoryDraftInput): TacPredictFactoryDraft {
  const outcomes =
    input.outcomes && input.outcomes.length >= 2 ? input.outcomes : ["Yes", "No"];
  const keySeed = input.fingerprint || `${input.source}:${input.source_market_id}:${input.id}`;
  const proposedMarketKey = `TACP-8453-DRAFT-${slugPart(keySeed, 20) || input.id.replace(/-/g, "").slice(0, 12)}`;

  return {
    proposedMarketKey,
    chainId: 8453,
    collateral: "USDC",
    collateralAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    tradingMechanism: "CLOB",
    title: input.title,
    category: input.category,
    outcomes,
    rules: input.proposed_rules,
    closeAt: input.close_at ?? null,
    sourceTracking: {
      provider: input.source,
      sourceMarketId: input.source_market_id,
      sourceUrl: input.source_url,
      candidateId: input.id,
    },
    pricePolicy: {
      livePriceFrom: "native-orders-only",
      polymarketOdds: "reference-metadata-only",
      fabricateOdds: false,
    },
    status: "DRAFT_NOT_PUBLISHED",
    requires: [
      "human-or-policy-approved-publisher",
      "factory-createMarket-simulation",
      "trusted-oracle-rules-lock",
      "own-usdc-collateral-config",
    ],
  };
}
