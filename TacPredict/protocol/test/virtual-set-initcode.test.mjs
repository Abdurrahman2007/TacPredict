import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getCreate2Address, keccak256, stringToHex } from "viem";

const root = path.resolve(import.meta.dirname, "..");
const plan = JSON.parse(
  fs.readFileSync(path.join(root, "deployments/virtual-base-mainnet.initcode.json"), "utf8"),
);
const script = fs.readFileSync(path.join(root, "scripts/deploy-virtual-set.mjs"), "utf8");

const NAMES = [
  "VirtualUSDC",
  "VirtualMarketRegistry",
  "VirtualResolutionOracle",
  "VirtualMarketFactory",
  "VirtualConditionalPositions",
  "VirtualExchange",
  "VirtualSettlement",
];
const ADMIN = "0x57828f1aa32fd6be3988f240068df53ed94b7aef";
const ZERO = "0x0000000000000000000000000000000000000000";
const word = (value) =>
  typeof value === "bigint"
    ? value.toString(16).padStart(64, "0")
    : value.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const byName = Object.fromEntries(plan.contracts.map((c) => [c.name, c]));
const addr = (name) => byName[name].address;

test("the initcode file lists the seven contracts in dependency order on Base mainnet", () => {
  assert.equal(plan.chain_id, 8453);
  assert.equal(plan.create2_proxy, "0x4e59b44847b379578588920cA78FbF26c0B4956C");
  assert.deepEqual(
    plan.contracts.map((c) => c.name),
    NAMES,
  );
  assert.equal(new Set(plan.contracts.map((c) => c.address)).size, 7);
});

test("every initcode hashes to its recorded hash and derives its address from the salt", () => {
  for (const c of plan.contracts) {
    assert.match(c.initcode, /^0x[0-9a-f]+$/, `${c.name} initcode is lowercase hex`);
    assert.equal(c.initcode.length % 2, 0, `${c.name} initcode has whole bytes`);
    assert.equal(keccak256(c.initcode), c.initCodeHash, `${c.name} hash`);
    assert.equal(
      c.salt,
      keccak256(stringToHex(`TacPredict.virtual.v2.${c.name}`)),
      `${c.name} salt`,
    );
    assert.equal(
      getCreate2Address({
        from: plan.create2_proxy,
        salt: c.salt,
        bytecodeHash: c.initCodeHash,
      }).toLowerCase(),
      c.address,
      `${c.name} address`,
    );
  }
});

test("constructor arguments at the end of each initcode wire the set together", () => {
  const args = {
    VirtualUSDC: [ADMIN, ZERO, 1000n],
    VirtualMarketRegistry: [ADMIN, addr("VirtualUSDC")],
    VirtualResolutionOracle: [ADMIN, addr("VirtualMarketRegistry"), 5_000_000n, 60n],
    VirtualMarketFactory: [ADMIN, addr("VirtualMarketRegistry"), addr("VirtualResolutionOracle")],
    VirtualConditionalPositions: [addr("VirtualMarketRegistry")],
    VirtualExchange: [addr("VirtualMarketRegistry"), addr("VirtualConditionalPositions")],
    VirtualSettlement: [addr("VirtualMarketRegistry"), addr("VirtualConditionalPositions")],
  };
  for (const name of NAMES) {
    const tail = args[name].map(word).join("");
    assert.ok(byName[name].initcode.endsWith(tail), `${name} constructor arguments`);
  }
});

test("the deploy script sends nothing unless --send is given and never holds a key", () => {
  assert.ok(script.includes('flags.has("--send")'));
  assert.ok(script.includes("if (!send) continue;"));
  assert.ok(script.includes("process.env.DEPLOYER_PRIVATE_KEY"));
  assert.ok(
    !/0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/.test(script),
    "the script holds no key or hash literal",
  );
});
