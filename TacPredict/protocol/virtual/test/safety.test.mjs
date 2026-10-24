import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { root, compile } from "../scripts/compile.mjs";
import { virtualAmmAbi } from "../../../src/lib/virtual/abi.ts";
test("six original contracts, addresses, old compiler and real execution paths remain unchanged", () => {
  const paths = [
    "protocol/contracts/MarketRegistry.sol",
    "protocol/contracts/MarketFactory.sol",
    "protocol/contracts/ConditionalPositions.sol",
    "protocol/contracts/Exchange.sol",
    "protocol/contracts/ResolutionOracle.sol",
    "protocol/contracts/Settlement.sol",
    "protocol/deployments/base-mainnet.json",
    "protocol/scripts/compile.mjs",
    "src/lib/protocol/execution.ts",
    "src/lib/pool/pool-client.ts",
  ];
  execFileSync(
    "git",
    ["diff", "--exit-code", "2da5ae195cec916206e217ca71182b1baa8c39f7", "--", ...paths],
    { cwd: root + "../.." },
  );
});
test("application ABI matches separately compiled virtual contract; no asset ABI or fallback", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(virtualAmmAbi)),
    compile()["VirtualAMM.sol"].VirtualAMM.abi,
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
  assert(detail.includes("!feed.data?.virtualMode"));
});
