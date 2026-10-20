/** Read-only accounting diagnostics. Not deployment verification, authorization, or a withdrawal route.
 * Caller must obtain all counters/balances at ONE independently verified finalized block.
 * No RPC, secrets, signing, database writes or production activation is performed here.
 */
const MAX = (1n << 256n) - 1n;
function atomic(x) {
  if (typeof x !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(x))
    throw Error("Canonical uint256 decimal string required");
  const n = BigInt(x);
  if (n > MAX) throw Error("uint256 overflow");
  return n;
}
export function reconcileFeeV2Accounting(input) {
  const collected = atomic(input.totalFeesCollectedAtomic);
  const refunded = atomic(input.totalFeesRefundedAtomic);
  const released = atomic(input.totalFeesReleasedAtomic);
  const escrow = atomic(input.totalFeeEscrowAtomic);
  const balance = atomic(input.exchangeUsdcBalanceAtomic);
  if (refunded + released + escrow !== collected) throw Error("Fee conservation mismatch");
  if (balance < escrow) throw Error("Fee escrow undercollateralized");
  return {
    refundableOrPendingEscrowAtomic: escrow.toString(),
    cumulativeRefundedAtomic: refunded.toString(),
    cumulativeReleasedAtomic: released.toString(),
    unattributedBalanceAtomic: (balance - escrow).toString(),
    // Even unsolicited USDC is not sweepable under the reviewed V2 implementation.
    arbitrarySurplusWithdrawableAtomic: "0",
    releasedCounterIsCurrentTreasuryBalance: false,
    principalCollateralIncluded: false,
    oracleBondsIncluded: false,
    promotionalRewardsIncluded: false,
    executionAuthorized: false,
    chainEvidenceVerifiedByThisHelper: false,
  };
}
const statuses = new Set([
  "DRAFT",
  "UPCOMING",
  "OPEN",
  "CLOSED",
  "RESOLVING",
  "RESOLVED",
  "SETTLED",
  "VOID",
  "CANCELLED",
]);
export function feeV2TerminalRights(input) {
  if (!statuses.has(input.marketStatus) || typeof input.marketFeesReleased !== "boolean")
    throw Error("Exact registry status/release flag required");
  const paid = atomic(input.buyerFeesPaidAtomic);
  const refunded = atomic(input.buyerFeesRefundedAtomic);
  const escrow = atomic(input.marketFeeEscrowAtomic);
  if (refunded > paid) throw Error("Buyer fee refund exceeds collected fee");
  if (input.marketFeesReleased && (input.marketStatus !== "RESOLVED" || escrow !== 0n))
    throw Error("Invalid terminal fee release state");
  if (refunded > 0n && input.marketStatus !== "VOID")
    throw Error("Fee refunds require actual VOID");
  const refundable = input.marketStatus === "VOID" ? paid - refunded : 0n;
  if (refundable > escrow) throw Error("Buyer fee refund is not escrow-backed");
  return {
    buyerFeeRefundAtomic: refundable.toString(),
    treasuryFeeReleaseAtomic:
      input.marketStatus === "RESOLVED" && !input.marketFeesReleased ? escrow.toString() : "0",
    buyerRefundRecipient: "ORIGINAL_FEE_PAYER",
    treasuryRecipient: "IMMUTABLE_CONTRACT_TREASURY",
    principalClaimSeparate: true,
    // A diagnostic never authorizes transfers or bypasses Registry/contract checks.
    executionAuthorized: false,
    chainEvidenceVerifiedByThisHelper: false,
  };
}
