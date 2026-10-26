import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSync } from "esbuild";
import { keccak256 } from "viem";

const root = new URL("../../", import.meta.url);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tac-cancel-"));
const realViem = new URL(import.meta.resolve("viem")).pathname;
fs.writeFileSync(
  path.join(dir, "viem.mjs"),
  `export * from ${JSON.stringify(realViem)};
export function createPublicClient(){return globalThis.__tacCancellation.pub;}
export function createWalletClient(){return globalThis.__tacCancellation.wallet;}`,
);
fs.writeFileSync(
  path.join(dir, "submit.mjs"),
  "export function submitProtocolOrder(){throw Error('Not part of cancellation');}",
);
const source = fs
  .readFileSync(new URL("src/lib/protocol/execution.ts", root), "utf8")
  .replace(
    'from "@/lib/virtual/product-policy"',
    `from ${JSON.stringify(new URL("src/lib/virtual/product-policy.ts", root).pathname)}`,
  )
  .replace('from "viem"', `from ${JSON.stringify(path.join(dir, "viem.mjs"))}`)
  .replace(
    'from "./orders"',
    `from ${JSON.stringify(new URL("src/lib/protocol/orders.ts", root).pathname)}`,
  )
  .replace('from "./orders.functions"', `from ${JSON.stringify(path.join(dir, "submit.mjs"))}`);
fs.writeFileSync(path.join(dir, "execution.ts"), source);
const out = path.join(dir, "execution.mjs");
buildSync({
  entryPoints: [path.join(dir, "execution.ts")],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "bundle",
  nodePaths: [new URL("node_modules", root).pathname],
});
const { cancelSignedOrder } = await import(out);
const address = "0x" + "a".repeat(40),
  other = "0x" + "b".repeat(40);
const code = "0x6001",
  hash = "0x" + "1".repeat(64);
const d = {
  chainId: 8453,
  collateral: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  tradingEnabled: false,
  codeHashes: {},
};
for (const k of ["registry", "factory", "positions", "exchange", "oracle", "settlement"]) {
  d[k] = other;
  d.codeHashes[k] = keccak256(code);
}
const w = {
  provider: {
    request: async () => {
      throw Error("No live provider");
    },
  },
  address,
};
const offer = {
  order: {
    marketId: "1",
    outcome: 0,
    maker: address,
    isBuy: true,
    price: "500000",
    shares: "1000000",
    nonce: "0",
    expiration: "9999999999",
    taker: "0x" + "0".repeat(40),
  },
};
function mock({ chain = 8453, simError = false, receipt = "success" } = {}) {
  const calls = [];
  globalThis.__tacCancellation = {
    pub: {
      getChainId: async () => chain,
      getBytecode: async () => code,
      readContract: async () => d.collateral,
      simulateContract: async (args) => {
        calls.push(["simulate", args]);
        if (simError) throw Error("simulation denied");
        return { request: args };
      },
      waitForTransactionReceipt: async () => ({ status: receipt }),
    },
    wallet: {
      writeContract: async (args) => {
        calls.push(["write", args]);
        return hash;
      },
    },
  };
  return calls;
}
try {
  await test("obsolete real-USDC cancellation is disabled before any wallet RPC", async () => {
    const calls = mock();
    await assert.rejects(cancelSignedOrder(w, d, offer), /Real-USDC execution is disabled/);
    assert.equal(calls.length, 0);
  });
  await test("wrong maker/network cannot bypass virtual-only execution policy", async () => {
    const calls = mock({ chain: 1 });
    await assert.rejects(
      cancelSignedOrder({ ...w, address: other }, d, offer),
      /Real-USDC execution is disabled/,
    );
    assert.equal(calls.length, 0);
  });
  await test("legacy real-asset policy cannot be enabled by tradingEnabled or successful RPC stubs", async () => {
    const calls = mock();
    await assert.rejects(
      cancelSignedOrder(w, { ...d, tradingEnabled: true }, offer),
      /Real-USDC execution is disabled/,
    );
    assert.equal(calls.length, 0);
  });
} finally {
  delete globalThis.__tacCancellation;
  fs.rmSync(dir, { recursive: true, force: true });
}
