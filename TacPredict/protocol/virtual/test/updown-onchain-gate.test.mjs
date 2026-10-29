import { test } from "node:test";
import assert from "node:assert/strict";
import { onchainVirtualExecutionAllowed } from "../../../src/lib/virtual/updown-onchain-gate.ts";

const sepolia = {
  id: "84532:0xcf59:hash",
  engine: "0xCF59F3Ff524cC1bD4e11177937D3BCBE62860E46",
  chainId: 84532,
  codeHash: "0xbcc5446f4cb392475d4c7a98bb1d3c1948b3d345e2410c84cabdc0e109113535",
  startBlock: "51715578",
  enabled: true,
  model: "feed-v1",
};

test("Sepolia feed-v1 enabled deployment may execute on-chain", () => {
  assert.equal(onchainVirtualExecutionAllowed(sepolia).allowed, true);
});

test("Mainnet blocked without VIRTUAL_MAINNET_EXECUTION_APPROVED", () => {
  delete process.env["VIRTUAL_MAINNET_EXECUTION_APPROVED"];
  const r = onchainVirtualExecutionAllowed({ ...sepolia, chainId: 8453 });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /Mainnet/);
});

test("disabled or missing deployment cannot execute", () => {
  assert.equal(onchainVirtualExecutionAllowed(null).allowed, false);
  assert.equal(onchainVirtualExecutionAllowed({ ...sepolia, enabled: false }).allowed, false);
});
