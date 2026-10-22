import test from "node:test";
import assert from "node:assert/strict";
import {
  atomicToDecimal,
  priceToCents,
  detailField,
  parseMarketRow,
  parseTradeRow,
  parseResolutionRow,
  parseBlockchainRows,
  countMarketsByStatus,
  blockLag,
  formatDuration,
  formatTimestamp,
} from "../../src/lib/protocol/admin-rows.mjs";

test("atomic amounts stay exact beyond Number precision and unknown stays null", () => {
  assert.equal(atomicToDecimal("12345678"), "12.34");
  assert.equal(atomicToDecimal("9007199254740993123456", 6, 6), "9,007,199,254,740,993.123456");
  assert.equal(atomicToDecimal("0"), "0.00");
  assert.equal(atomicToDecimal(null), null);
  assert.equal(atomicToDecimal("-1"), null);
  assert.equal(priceToCents("620000"), "62.00¢");
  assert.equal(priceToCents("1500"), "0.15¢");
  assert.equal(priceToCents("abc"), null);
});

test("detail fields are read by exact key prefix", () => {
  const detail = "On-chain ID 7\nStatus OPEN\nQuestion 0xaa\nClose 2026-10-31";
  assert.equal(detailField(detail, "Status"), "OPEN");
  assert.equal(detailField(detail, "On-chain ID"), "7");
  assert.equal(detailField(detail, "Missing"), null);
});

test("market rows split into code/title and keep prepared terms separate", () => {
  const market = parseMarketRow({
    id: "uuid-1",
    label: "TACP-8453-000001 · Will BTC be above $120K · by Dec?",
    detail:
      "On-chain ID 1\nStatus UPCOMING\nQuestion 0xq\nCondition 0xc\nClose 2026-12-31 00:00:00+00",
    usdcAtoms: "5000000",
    observedAt: "2026-10-12",
  });
  assert.equal(market.kind, "market");
  assert.equal(market.code, "TACP-8453-000001");
  assert.equal(market.title, "Will BTC be above $120K · by Dec?");
  assert.equal(market.status, "UPCOMING");
  assert.equal(market.liquidityAtomic, "5000000");
  const terms = parseMarketRow({
    id: "terms-0xabc",
    label: "Prepared terms · Draft title",
    detail: "Not an on-chain market",
    usdcAtoms: null,
    observedAt: null,
  });
  assert.deepEqual(
    [terms.kind, terms.title, terms.metadataHash],
    ["terms", "Draft title", "0xabc"],
  );
  const counts = countMarketsByStatus([market, terms]);
  assert.equal(counts.UPCOMING, 1);
  assert.equal(counts.OPEN, 0);
});

test("trade and resolution rows expose only recorded fields", () => {
  const trade = parseTradeRow({
    id: "t1",
    label: "Finalized trade · TACP-8453-000001",
    detail: "Outcome 0\nShares (atomic) 2000000\nPrice (atomic USDC) 620000\nTX 0xdead",
    usdcAtoms: "1240000",
    observedAt: "2026-10-13",
  });
  assert.deepEqual(
    [
      trade.market,
      trade.outcomeIndex,
      trade.sharesAtomic,
      trade.priceAtomic,
      trade.txHash,
      trade.usdcAtomic,
    ],
    ["TACP-8453-000001", "0", "2000000", "620000", "0xdead", "1240000"],
  );
  const resolution = parseResolutionRow({
    id: "r1",
    label: "TACP-8453-000001 · PROPOSED",
    detail: "Outcome 1\nChallenge deadline 2026-11-01\nEvidence 0xe\nSource 0xs",
    usdcAtoms: null,
    observedAt: "2026-10-31",
  });
  assert.deepEqual(
    [resolution.market, resolution.status, resolution.proposedOutcome, resolution.evidenceHash],
    ["TACP-8453-000001", "PROPOSED", "1", "0xe"],
  );
});

test("blockchain rows give checkpoint and verified contract addresses", () => {
  const a = (n) => "0x" + String(n).repeat(40);
  const parsed = parseBlockchainRows([
    {
      id: "checkpoint",
      label: "Finalized checkpoint",
      detail: "52457637\nCanonical hash 0xhash",
      usdcAtoms: null,
      observedAt: "t",
    },
    {
      id: "deployment",
      label: "Verified Base deployment",
      detail: `Registry ${a(1)}\nFactory ${a(2)}\nPositions ${a(3)}\nExchange ${a(4)}\nOracle ${a(5)}\nSettlement ${a(6)}\nDatabase trading enabled: false. This is an indexed/config record`,
      usdcAtoms: null,
      observedAt: "t2",
    },
  ]);
  assert.equal(parsed.checkpoint.block, "52457637");
  assert.equal(parsed.deployment.contracts.length, 6);
  assert.equal(parsed.deployment.databaseTradingEnabled, false);
  assert.deepEqual(parseBlockchainRows([]), { checkpoint: null, deployment: null });
});

test("indexer lag is unknown unless both numbers are known", () => {
  assert.equal(blockLag("100", "98"), 2n);
  assert.equal(blockLag("98", "100"), 0n);
  assert.equal(blockLag(null, "100"), null);
  assert.equal(blockLag("100", undefined), null);
  assert.equal(formatDuration(86400), "1 day");
  assert.equal(formatDuration(172800), "2 days");
  assert.equal(formatDuration(5400), "90 minutes");
  assert.equal(formatDuration("x"), null);
});

test("timestamps are labelled UTC only when the offset is zero", () => {
  assert.equal(formatTimestamp("2026-10-12 08:21:33.123+00"), "2026-10-12 08:21 UTC");
  assert.equal(formatTimestamp("2026-10-12T08:21:33Z"), "2026-10-12 08:21 UTC");
  assert.equal(formatTimestamp("2026-10-12 08:21:33+06"), "2026-10-12 08:21:33+06");
  assert.equal(formatTimestamp(""), null);
  assert.equal(formatTimestamp(null), null);
});

import { createdMarketCount } from "../../src/lib/protocol/admin-rows.mjs";
test("created-market count subtracts next ID without loss of precision", () => {
  assert.equal(createdMarketCount("1"), "0");
  assert.equal(createdMarketCount("2"), "1");
  assert.equal(createdMarketCount("9007199254740995"), "9007199254740994");
  for (const v of [null, undefined, "", "0", "-1", "x"]) assert.equal(createdMarketCount(v), null);
});
