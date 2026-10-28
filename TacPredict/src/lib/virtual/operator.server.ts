import { encodeFunctionData, keccak256, toHex, type Hex } from "viem";
import { virtualPriceAmmAbi } from "./price-abi";
import { BASE_CHAINLINK_FEEDS, isChainlinkAsset } from "./chainlink-feeds";
import { findBoundaryRound } from "./feed-rounds.server";
import { lifecyclePlan, type LifecycleMarket } from "./lifecycle";
import { virtualRuntime } from "./runtime.server";

export type OperatorActionPlan = {
  marketId: string;
  action: "captureStart" | "proposeFromFeed" | "finalize" | "timeoutVoid";
  idempotencyKey: string;
  round?: string;
  evidenceHash?: Hex;
  to: Hex;
  data: Hex;
  requiresAuthorizedSubmission: boolean;
};

/**
 * Build unsigned operator calldata for feed-v1 markets.
 * Never signs or broadcasts — caller must use an approved role wallet separately.
 */
export async function planVirtualOperatorActions(
  now = Math.floor(Date.now() / 1000),
): Promise<{ deploymentId: string; engine: Hex; actions: OperatorActionPlan[] }> {
  const r = await virtualRuntime();
  if (r.deployment.model !== "feed-v1")
    throw Error("Operator lifecycle requires feed-v1 VirtualPriceAMM");
  if (!r.deployment.enabled) throw Error("Virtual trading disabled");

  const markets: LifecycleMarket[] = [];
  for (const meta of r.markets) {
    if (meta.resolutionSpec?.kind !== "crypto" || !isChainlinkAsset(meta.resolutionSpec.asset))
      continue;
    const id = BigInt(meta.id);
    const pool = await r.client.readContract({
      address: r.deployment.engine,
      abi: virtualPriceAmmAbi,
      functionName: "pool",
      args: [id],
    });
    const start = await r.client.readContract({
      address: r.deployment.engine,
      abi: virtualPriceAmmAbi,
      functionName: "startPrice",
      args: [id],
    });
    const startRound = await r.client.readContract({
      address: r.deployment.engine,
      abi: virtualPriceAmmAbi,
      functionName: "startRound",
      args: [id],
    });
    const proposal = await r.client.readContract({
      address: r.deployment.engine,
      abi: virtualPriceAmmAbi,
      functionName: "proposals",
      args: [id],
    });
    const policy = await r.client.readContract({
      address: r.deployment.engine,
      abi: virtualPriceAmmAbi,
      functionName: "pricePolicies",
      args: [id],
    });
    const feed = policy[0];
    const tolerance = Number(policy[4]);
    let startRoundStr: string | null = startRound > 0n ? startRound.toString() : null;
    let closingRound: string | null = null;
    try {
      if (start === 0n && now >= Number(pool.terms.openAt)) {
        const round = await findBoundaryRound(
          r.client,
          feed,
          pool.terms.openAt,
          tolerance,
        );
        startRoundStr = round.toString();
      }
      if (start > 0n && now >= Number(pool.terms.closeAt) && !proposal[2]) {
        const round = await findBoundaryRound(
          r.client,
          feed,
          pool.terms.closeAt,
          tolerance,
        );
        closingRound = round.toString();
      }
    } catch {
      // Boundary not available yet — omit round; planner skips until ready.
    }
    markets.push({
      id: meta.id,
      startsAt: Number(pool.terms.openAt),
      closesAt: Number(pool.terms.closeAt),
      resolutionDeadline: Number(pool.terms.resolutionDeadline),
      startCaptured: start > 0n,
      proposed: Boolean(proposal[2]),
      disputed: Boolean(proposal[3]),
      final: Boolean(pool.final_),
      challengeUntil: proposal[2] ? Number(proposal[1]) : null,
      startRound: startRoundStr,
      closingRound,
    });
  }

  const planned = lifecyclePlan(markets, now);
  const actions: OperatorActionPlan[] = [];
  for (const step of planned) {
    const marketId = BigInt(step.marketId);
    if (step.action === "captureStart") {
      const m = markets.find((x) => x.id === step.marketId)!;
      if (!m.startRound) continue;
      const round = BigInt(m.startRound);
      actions.push({
        marketId: step.marketId,
        action: "captureStart",
        idempotencyKey: step.idempotencyKey,
        round: m.startRound,
        to: r.deployment.engine,
        data: encodeFunctionData({
          abi: virtualPriceAmmAbi,
          functionName: "captureStart",
          args: [marketId, round],
        }),
        requiresAuthorizedSubmission: false, // permissionless once round known
      });
    } else if (step.action === "proposeFromFeed") {
      const m = markets.find((x) => x.id === step.marketId)!;
      if (!m.closingRound) continue;
      const round = BigInt(m.closingRound);
      const evidenceHash = keccak256(
        toHex(`tacpredict:proposeFromFeed:${r.deployment.id}:${step.marketId}:${m.closingRound}`),
      );
      actions.push({
        marketId: step.marketId,
        action: "proposeFromFeed",
        idempotencyKey: step.idempotencyKey,
        round: m.closingRound,
        evidenceHash,
        to: r.deployment.engine,
        data: encodeFunctionData({
          abi: virtualPriceAmmAbi,
          functionName: "proposeFromFeed",
          args: [marketId, round, evidenceHash],
        }),
        requiresAuthorizedSubmission: true, // PROPOSER_ROLE
      });
    } else if (step.action === "finalize") {
      actions.push({
        marketId: step.marketId,
        action: "finalize",
        idempotencyKey: step.idempotencyKey,
        to: r.deployment.engine,
        data: encodeFunctionData({
          abi: virtualPriceAmmAbi,
          functionName: "finalize",
          args: [marketId],
        }),
        requiresAuthorizedSubmission: false,
      });
    } else if (step.action === "timeoutVoid") {
      actions.push({
        marketId: step.marketId,
        action: "timeoutVoid",
        idempotencyKey: step.idempotencyKey,
        to: r.deployment.engine,
        data: encodeFunctionData({
          abi: virtualPriceAmmAbi,
          functionName: "timeoutVoid",
          args: [marketId],
        }),
        requiresAuthorizedSubmission: false,
      });
    }
  }

  // Surface feed registry for operators configuring new markets (no XRP).
  void BASE_CHAINLINK_FEEDS;

  return {
    deploymentId: r.deployment.id,
    engine: r.deployment.engine,
    actions,
  };
}
