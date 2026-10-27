import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { root, compile } from "../scripts/compile.mjs";
import { virtualPriceAmmAbi } from "../../../src/lib/virtual/price-abi.ts";
import { virtualAmmAbi } from "../../../src/lib/virtual/abi.ts";
test("six original contracts, addresses and old compiler remain unchanged", () => {
  const paths = [
    "protocol/contracts/MarketRegistry.sol",
    "protocol/contracts/MarketFactory.sol",
    "protocol/contracts/ConditionalPositions.sol",
    "protocol/contracts/Exchange.sol",
    "protocol/contracts/ResolutionOracle.sol",
    "protocol/contracts/Settlement.sol",
    "protocol/deployments/base-mainnet.json",
    "protocol/scripts/compile.mjs",
  ];
  execFileSync(
    "git",
    ["diff", "--exit-code", "2da5ae195cec916206e217ca71182b1baa8c39f7", "--", ...paths],
    { cwd: root + "../.." },
  );
});
test("application ABI matches separately compiled virtual contract; no asset ABI or fallback", () => {
  const contracts = compile();
  assert.deepEqual(
    JSON.parse(JSON.stringify(virtualAmmAbi)),
    contracts["VirtualAMM.sol"].VirtualAMM.abi,
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(virtualPriceAmmAbi)),
    contracts["VirtualPriceAMM.sol"].VirtualPriceAMM.abi,
  );
  const execution = fs.readFileSync(root + "../../src/lib/virtual/execution.ts", "utf8");
  for (const forbidden of [
    "placeLimitBuy",
    "placeLimitSell",
    "fillOffer",
    "erc20Abi",
    "positionAbi",
    "approve",
    "pool-client",
  ])
    assert(!execution.includes(forbidden));
  const wrapper = fs.readFileSync(root + "../../src/components/prediction-amount-card.tsx", "utf8");
  assert(/props\.market\.virtual\s*\?\s*<?\(?\s*<VirtualAmountCard/.test(wrapper));
  const detail = fs.readFileSync(root + "../../src/components/updown/updown-detail.tsx", "utf8");
  assert(detail.includes("virtual-only product: legacy pool disabled"));
});

test("operations/verifier are dormant and cannot sign, spend or submit transactions", () => {
  for (const p of [
    "scripts/operations.mts",
    "scripts/prepare-price-sepolia.mjs",
    "scripts/verify-sepolia.mts",
    "scripts/verify-mainnet-canary.mjs",
    "scripts/prepare-mainnet-canary.mjs",
    "scripts/deployment-proxy.mjs",
  ]) {
    const s = fs.readFileSync(root + p, "utf8");
    assert.doesNotMatch(
      s,
      /privateKeyToAccount|sendTransaction|writeContract|sendRawTransaction|deployContract\s*\(/,
    );
  }
  const ci = fs.readFileSync(
    root + "../../../.github/workflows/virtual-trading-review.yml",
    "utf8",
  );
  assert(ci.includes("fetch-depth: 0"));
  assert.doesNotMatch(ci, /secrets\.|wrangler.*deploy|workflow_dispatch|schedule:/);
});
