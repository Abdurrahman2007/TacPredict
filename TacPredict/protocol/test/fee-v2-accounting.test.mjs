import test from "node:test";
import assert from "node:assert/strict";
import { reconcileFeeV2Accounting, feeV2TerminalRights } from "../scripts/fee-v2-accounting.mjs";
const counters = {
  totalFeesCollectedAtomic: "100000",
  totalFeesRefundedAtomic: "0",
  totalFeesReleasedAtomic: "0",
  totalFeeEscrowAtomic: "100000",
  exchangeUsdcBalanceAtomic: "100000",
};
const market = {
  marketStatus: "OPEN",
  marketFeesReleased: false,
  buyerFeesPaidAtomic: "100000",
  buyerFeesRefundedAtomic: "0",
  marketFeeEscrowAtomic: "100000",
};
test("additional $0.10 on a $10 trade is escrow liability, not immediately spendable treasury revenue", () => {
  const x = reconcileFeeV2Accounting(counters);
  assert.equal(x.refundableOrPendingEscrowAtomic, "100000");
  assert.equal(x.arbitrarySurplusWithdrawableAtomic, "0");
  assert.equal(x.executionAuthorized, false);
  assert.equal(x.chainEvidenceVerifiedByThisHelper, false);
});
test("unattributed donations cannot be swept and released counters are not treasury balance", () => {
  const x = reconcileFeeV2Accounting({ ...counters, exchangeUsdcBalanceAtomic: "150000" });
  assert.equal(x.unattributedBalanceAtomic, "50000");
  assert.equal(x.arbitrarySurplusWithdrawableAtomic, "0");
  assert.equal(x.releasedCounterIsCurrentTreasuryBalance, false);
});
test("counter conservation, collateral deficit and malformed or floating point financial values fail closed", () => {
  for (const patch of [
    { totalFeesCollectedAtomic: "100001" },
    { exchangeUsdcBalanceAtomic: "99999" },
    { totalFeeEscrowAtomic: 100000 },
    { totalFeesReleasedAtomic: "1.0" },
    { totalFeesRefundedAtomic: "1e5" },
    { totalFeesCollectedAtomic: "0100000" },
    { totalFeesCollectedAtomic: (1n << 256n).toString() },
  ])
    assert.throws(() => reconcileFeeV2Accounting({ ...counters, ...patch }));
});
test("large values remain exact beyond JavaScript safe integer range", () => {
  const n = "900719925474099312345678";
  assert.equal(
    reconcileFeeV2Accounting({
      ...counters,
      totalFeesCollectedAtomic: n,
      totalFeeEscrowAtomic: n,
      exchangeUsdcBalanceAtomic: n,
    }).refundableOrPendingEscrowAtomic,
    n,
  );
});
test("open, closed, resolving and unsupported terminal enum paths grant no fee withdrawal", () => {
  for (const marketStatus of [
    "DRAFT",
    "UPCOMING",
    "OPEN",
    "CLOSED",
    "RESOLVING",
    "SETTLED",
    "CANCELLED",
  ]) {
    const r = feeV2TerminalRights({ ...market, marketStatus });
    assert.equal(r.buyerFeeRefundAtomic, "0");
    assert.equal(r.treasuryFeeReleaseAtomic, "0");
  }
});
test("actual VOID fee refund follows original payer independently of current shares and has no treasury release", () => {
  const r = feeV2TerminalRights({ ...market, marketStatus: "VOID" });
  assert.equal(r.buyerFeeRefundAtomic, "100000");
  assert.equal(r.treasuryFeeReleaseAtomic, "0");
  assert.equal(r.buyerRefundRecipient, "ORIGINAL_FEE_PAYER");
  assert.equal(r.principalClaimSeparate, true);
  const done = feeV2TerminalRights({
    ...market,
    marketStatus: "VOID",
    buyerFeesRefundedAtomic: "100000",
    marketFeeEscrowAtomic: "0",
  });
  assert.equal(done.buyerFeeRefundAtomic, "0");
});
test("only actual RESOLVED allows earned fee release; released state yields no duplicate release", () => {
  assert.equal(
    feeV2TerminalRights({ ...market, marketStatus: "RESOLVED" }).treasuryFeeReleaseAtomic,
    "100000",
  );
  assert.equal(
    feeV2TerminalRights({
      ...market,
      marketStatus: "RESOLVED",
      marketFeesReleased: true,
      marketFeeEscrowAtomic: "0",
    }).treasuryFeeReleaseAtomic,
    "0",
  );
});
test("inconsistent refunds/releases and unbacked buyer refunds halt diagnostics", () => {
  for (const patch of [
    { marketStatus: "VOID", buyerFeesRefundedAtomic: "100001" },
    { marketStatus: "VOID", marketFeeEscrowAtomic: "99999" },
    { marketStatus: "RESOLVED", marketFeesReleased: true },
    { marketStatus: "VOID", marketFeesReleased: true, marketFeeEscrowAtomic: "0" },
    { buyerFeesRefundedAtomic: "1" },
    { marketStatus: 7 },
    { marketFeesReleased: "false" },
  ])
    assert.throws(() => feeV2TerminalRights({ ...market, ...patch }));
});
