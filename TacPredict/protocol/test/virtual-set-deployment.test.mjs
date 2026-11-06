import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getAddress, getCreate2Address } from "viem";
import {
  VIRTUAL_SET_ADDRESSES,
  VIRTUAL_SET_ADMIN,
  VIRTUAL_SET_CHAIN_ID,
  VIRTUAL_SET_FLAGS,
  VIRTUAL_USDC_DECIMALS,
  isVirtualSetAddress,
  virtualSetBlockers,
} from "../../src/lib/virtual-set/deployment.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "protocol/deployments/virtual-base-mainnet.json"), "utf8"));
const legacy = JSON.parse(fs.readFileSync(path.join(root, "protocol/deployments/base-mainnet.json"), "utf8"));
const abiSource = fs.readFileSync(path.join(root, "src/lib/virtual-set/abi.ts"), "utf8");

test("the app config is the deployment manifest: same chain, admin and seven addresses", () => {
  assert.equal(VIRTUAL_SET_CHAIN_ID, 8453);
  assert.equal(manifest.chain_id, VIRTUAL_SET_CHAIN_ID);
  assert.equal(getAddress(manifest.admin), VIRTUAL_SET_ADMIN);
  assert.equal(VIRTUAL_USDC_DECIMALS, 6);
  assert.deepEqual(Object.keys(VIRTUAL_SET_ADDRESSES).sort(), Object.keys(manifest.contracts).sort());
  for (const [key, address] of Object.entries(VIRTUAL_SET_ADDRESSES)) {
    assert.equal(address, getAddress(address), `${key} is checksummed`);
    assert.equal(address, manifest.contracts[key].address, `${key} matches the manifest`);
  }
  assert.equal(manifest.collateral_token, VIRTUAL_SET_ADDRESSES.usdc);
  assert.equal(manifest.collateral_is_virtual, true);
});

test("every address is the CREATE2 address of its recorded salt and initcode hash", () => {
  for (const [key, c] of Object.entries(manifest.contracts)) {
    const expected = getCreate2Address({ from: manifest.create2_proxy, salt: c.salt, bytecodeHash: c.initCodeHash });
    assert.equal(expected, c.address, `${key}: salt and initcode hash derive the deployed address`);
    assert.match(c.txHash, /^0x[0-9a-f]{64}$/);
    assert.ok(Number(c.blockNumber) >= Number(manifest.deployment_block));
  }
});

test("the manifest is the exact-initcode plan that was deployed: same salts, hashes, sizes and constructor arguments", () => {
  const plan = JSON.parse(fs.readFileSync(path.join(root, "protocol/deployments/virtual-base-mainnet.initcode.json"), "utf8"));
  assert.equal(plan.create2_proxy, manifest.create2_proxy);
  assert.equal(plan.contracts.length, Object.keys(manifest.contracts).length);
  for (const c of Object.values(manifest.contracts)) {
    const p = plan.contracts.find((x) => x.name === c.name);
    assert.ok(p, `${c.name} is in the initcode plan`);
    assert.equal(p.address.toLowerCase(), c.address.toLowerCase(), `${c.name} address`);
    assert.equal(p.salt, c.salt, `${c.name} salt`);
    assert.equal(p.initCodeHash, c.initCodeHash, `${c.name} initcode hash`);
    assert.equal((p.initcode.length - 2) / 2, c.initCodeBytes, `${c.name} initcode size`);
    assert.equal(c.immutablePlaceholdersFilled, 0, `${c.name} was deployed from the plain compiler output`);
    assert.ok(p.initcode.endsWith(c.constructorArgsHex), `${c.name} constructor arguments are the end of the initcode`);
  }
  assert.equal(manifest.deployment_block, manifest.contracts.usdc.blockNumber);
  assert.match(manifest.wiring.txHash, /^0x[0-9a-f]{64}$/);
  assert.match(manifest.wiring.lockTxHash, /^0x[0-9a-f]{64}$/);
});

test("the set is separate from the six production contracts and from the real USDC", () => {
  const legacyAddresses = new Set(
    [legacy.collateral_token, legacy.registry, legacy.oracle, legacy.factory, legacy.positions, legacy.exchange, legacy.settlement].map((a) =>
      a.toLowerCase(),
    ),
  );
  const mine = Object.values(VIRTUAL_SET_ADDRESSES).map((a) => a.toLowerCase());
  assert.equal(new Set(mine).size, 7, "seven distinct contracts");
  for (const address of mine) assert.ok(!legacyAddresses.has(address), `${address} is not a production contract`);
  for (const address of mine) assert.ok(isVirtualSetAddress(address));
  assert.equal(isVirtualSetAddress(legacy.registry), false);
  assert.equal(isVirtualSetAddress(undefined), false);
});

test("trading and verification flags are off and move together with the manifest", () => {
  assert.equal(VIRTUAL_SET_FLAGS.executionEnabled, false);
  assert.equal(manifest.trading_enabled, false);
  assert.equal(VIRTUAL_SET_FLAGS.basescanVerified, manifest.basescan_verified);
  assert.deepEqual(virtualSetBlockers(), ["execution_disabled"]);
  assert.deepEqual(virtualSetBlockers({ executionEnabled: true, basescanVerified: true }), []);
  assert.deepEqual(virtualSetBlockers({ executionEnabled: true, basescanVerified: false }), ["source_not_verified"]);
});

test("the wiring that was set onchain is the exact protocol list: positions, exchange, oracle", () => {
  const { wiring, contracts } = manifest;
  assert.deepEqual(wiring.usdc_protocol_list, [contracts.positions.address, contracts.exchange.address, contracts.oracle.address]);
  assert.equal(wiring.usdc_protocol_locked, true);
  assert.equal(wiring.registry_roles.FACTORY_ROLE.holder, contracts.factory.address);
  assert.equal(wiring.registry_roles.ORACLE_ROLE.holder, contracts.oracle.address);
  assert.equal(manifest.parameters.box_granter, "0x0000000000000000000000000000000000000000", "no box granter is set yet");
});

test("the ABI file carries the calls the app needs and no address", () => {
  for (const name of [
    "virtualUsdcAbi",
    "virtualMarketRegistryAbi",
    "virtualMarketFactoryAbi",
    "virtualResolutionOracleAbi",
    "virtualConditionalPositionsAbi",
    "virtualExchangeAbi",
    "virtualSettlementAbi",
  ])
    assert.ok(abiSource.includes(`export const ${name} =`), `${name} is exported`);
  for (const fn of ["checkIn", "boxClaimed", "lastCheckInDay", "streak", "balanceOf", "fillOrder"])
    assert.ok(abiSource.includes(`name: "${fn}"`), `${fn} is in the ABI`);
  assert.ok(!/0x[0-9a-fA-F]{40}/.test(abiSource), "the ABI file holds no address");
});

test("the Basescan package is built from the contracts in this repository and lists every constructor argument", () => {
  const input = JSON.parse(fs.readFileSync(path.join(root, "protocol/deployments/virtual-base-mainnet.standard-input.json"), "utf8"));
  assert.equal(input.language, "Solidity");
  assert.deepEqual(
    { enabled: input.settings.optimizer.enabled, runs: input.settings.optimizer.runs, viaIR: input.settings.viaIR, evm: input.settings.evmVersion },
    { enabled: true, runs: 200, viaIR: true, evm: "shanghai" },
  );
  for (const c of Object.values(manifest.contracts)) {
    const file = `contracts/${c.name}.sol`;
    assert.equal(input.sources[file]?.content, fs.readFileSync(path.join(root, "protocol", file), "utf8"), `${file} matches the repository`);
  }
  const guide = fs.readFileSync(path.join(root, "docs/VIRTUAL_SET_BASESCAN_VERIFICATION.md"), "utf8");
  for (const c of Object.values(manifest.contracts)) {
    assert.ok(guide.includes(c.address), `${c.name} address is in the guide`);
    assert.ok(guide.includes(c.constructorArgsHex), `${c.name} constructor arguments are in the guide`);
    assert.ok(guide.includes(c.verifyContract), `${c.name} contract name is in the guide`);
  }
});
