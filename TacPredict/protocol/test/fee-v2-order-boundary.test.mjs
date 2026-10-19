import test from "node:test";
import assert from "node:assert/strict";
import { hashTypedData, zeroAddress } from "viem";
import { feeV2TypedData, feeV2DebitDisclosure } from "../../src/lib/protocol/fee-v2-orders.mjs";
import { feeV2Quote } from "../../src/lib/protocol/fee-v2.mjs";
const a = (n) => "0x" + n.repeat(40);
const context = {
  chainId: 84532,
  exchange: a("a"),
  treasury: a("b"),
  marketId: "9007199254740993",
  outcomeCount: "2",
  nowSeconds: "100",
  closeAtSeconds: "1000",
};
const order = {
  marketId: context.marketId,
  outcome: "0",
  maker: a("c"),
  isBuy: true,
  price: "500000",
  shares: "20000000",
  nonce: "0",
  expiration: "900",
  taker: zeroAddress,
  feeBps: "100",
  feeRecipient: context.treasury,
  maxTotalCost: "10100000",
};
test("V2 exact typed data preserves large IDs and uses separate fee consent domain", () => {
  const r = feeV2TypedData(order, context);
  assert.equal(r.typedData.message.marketId, 9007199254740993n);
  assert.equal(r.executionAuthorized, false);
  assert.equal(r.orderId, hashTypedData(r.typedData));
  assert.notEqual(
    r.orderId,
    hashTypedData({
      ...r.typedData,
      domain: { ...r.typedData.domain, name: "TacPredictExchange", version: "1" },
    }),
  );
});
test("V1 order/unknown fields, Number/float/exponent/overflow and truthy side reject", () => {
  for (const patch of [
    { marketId: 9007199254740992 },
    { marketId: "01" },
    { price: "5e5" },
    { shares: "1.0" },
    { nonce: (1n << 256n).toString() },
    { isBuy: "true" },
    { outcome: "256" },
    { expiration: (1n << 64n).toString() },
    { extra: "unsupported" },
  ])
    assert.throws(() => feeV2TypedData({ ...order, ...patch }, context));
  const v1 = { ...order };
  delete v1.feeBps;
  assert.throws(() => feeV2TypedData(v1, context));
});
test("chain/instance/treasury/market/outcome/time boundaries fail closed", () => {
  for (const patch of [
    { chainId: 1 },
    { exchange: zeroAddress },
    { exchange: context.treasury },
    { exchange: "0x7e5e40bae779ebabb2295ef6d009ab95b0307f85" },
    { marketId: "1" },
    { outcomeCount: "1" },
    { nowSeconds: "900" },
    { closeAtSeconds: "899" },
  ])
    assert.throws(() => feeV2TypedData(order, { ...context, ...patch }));
  for (const patch of [
    { feeBps: "99" },
    { feeRecipient: a("d") },
    { maker: zeroAddress },
    { outcome: "2" },
    { price: "0" },
    { price: "1000000" },
    { shares: "0" },
    { maxTotalCost: "0" },
    { expiration: "100" },
  ])
    assert.throws(() => feeV2TypedData({ ...order, ...patch }, context));
});
test("sell fee consent requires zero debit cap and signatures change with every material domain/consent field", () => {
  assert.equal(
    feeV2TypedData({ ...order, isBuy: false, maxTotalCost: "0" }, context).executionAuthorized,
    false,
  );
  assert.throws(() => feeV2TypedData({ ...order, isBuy: false }, context));
  const id = feeV2TypedData(order, context).orderId;
  for (const c of [
    { ...context, chainId: 8453 },
    { ...context, exchange: a("d") },
  ])
    assert.notEqual(feeV2TypedData(order, c).orderId, id);
  for (const p of [{ maxTotalCost: "10100001" }, { taker: a("e") }, { nonce: "1" }])
    assert.notEqual(feeV2TypedData({ ...order, ...p }, context).orderId, id);
});
test("$10 notional disclosure is 10 + 0.10 = 10.10 USDC, escrow NOT immediately earned revenue", () => {
  const d = feeV2DebitDisclosure(feeV2Quote("0", "10000000"), "0");
  assert.equal(d.tradeAmountAtomic, "10000000");
  assert.equal(d.additionalBuyerFeeAtomic, "100000");
  assert.equal(d.totalBuyerDebitAtomic, "10100000");
  assert.equal(d.sellerReceiptAtomic, "10000000");
  assert.equal(d.feeStatus, "REFUNDABLE_ESCROW");
  assert.equal(d.principalRefundSeparate, true);
  assert.equal(d.executionAuthorized, false);
  for (const p of [
    { feeAtomic: "200000", buyerDebitAtomic: "10200000" },
    { buyerDebitAtomic: "10000000" },
    { sellerReceiptAtomic: "9900000" },
    { feeBps: "99" },
    { feeAtomic: 100000 },
  ])
    assert.throws(() => feeV2DebitDisclosure({ ...feeV2Quote("0", "10000000"), ...p }, "0"));
});
