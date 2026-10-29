import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  decodeEventLog,
} from "viem";
import { compile, root } from "../scripts/compile.mjs";
import {
  deploymentProxy,
  deploymentProxyRuntime,
  assertDeploymentProxy,
  proxyDeployment,
  assertRuntime,
} from "../scripts/deployment-proxy.mjs";
let rpc, wallet, accounts, artifact, server, prepared;
const chain = {
  id: 31337,
  name: "Local deployment route test",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:18549"] } },
};
before(async () => {
  artifact = compile()["VirtualAMM.sol"].VirtualAMM;
  server = spawn(
    process.execPath,
    [
      root + "node_modules/hardhat/dist/src/cli.js",
      "node",
      "--network",
      "local",
      "--hostname",
      "127.0.0.1",
      "--port",
      "18549",
    ],
    { cwd: root, stdio: "ignore" },
  );
  rpc = createPublicClient({ chain, transport: http() });
  for (let i = 0; i < 150; i++) {
    try {
      if ((await rpc.getChainId()) === 31337) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  accounts = await rpc.request({ method: "eth_accounts" });
  wallet = createWalletClient({ chain, account: accounts[0], transport: http() });
  // Local-only bytecode installation. Never called on Mainnet.
  await rpc.request({
    method: "hardhat_setCode",
    params: [deploymentProxy, deploymentProxyRuntime],
  });
  prepared = proxyDeployment(
    artifact,
    accounts[1],
    10000_000000n,
    100_000000n,
    keccak256(stringToHex("private local QA route")),
  );
});
after(() => server?.kill());
test("published proxy runtime is exact and modified/absent proxy code is rejected", async () => {
  assertDeploymentProxy(await rpc.getBytecode({ address: deploymentProxy }));
  for (const code of [undefined, "0x", "0x00", deploymentProxyRuntime + "00"])
    assert.throws(() => assertDeploymentProxy(code));
});
test("proxy creation yields exact reviewed engine, explicit admin, finite virtual caps and no activation", async () => {
  assert.equal(await rpc.getBytecode({ address: prepared.engine }), undefined);
  const simulated = await rpc.call({
    account: accounts[0],
    to: deploymentProxy,
    data: prepared.data,
    value: 0n,
  });
  assert.equal(simulated.data.toLowerCase(), prepared.engine.toLowerCase());
  const hash = await wallet.sendTransaction({
    to: deploymentProxy,
    data: prepared.data,
    value: 0n,
  });
  const receipt = await rpc.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  assert.equal(receipt.contractAddress, null);
  assertRuntime(artifact, await rpc.getBytecode({ address: prepared.engine }));
  const read = (functionName, args = []) =>
    rpc.readContract({ address: prepared.engine, abi: artifact.abi, functionName, args });
  assert.equal(await read("seedBudget"), 10000_000000n);
  assert.equal(await read("grantBudget"), 100_000000n);
  const zero = "0x" + "0".repeat(64);
  assert.equal(await read("hasRole", [zero, accounts[1]]), true);
  assert.equal(await read("hasRole", [zero, accounts[0]]), false);
  assert.equal(await read("hasRole", [zero, deploymentProxy]), false);
  for (const name of [
    "seeded",
    "granted",
    "poolCount",
    "campaignCount",
    "totalCash",
    "lockedCollateral",
  ])
    assert.equal(await read(name), 0n);
  for (const role of [
    "CREATOR_ROLE",
    "GUARDIAN_ROLE",
    "PROPOSER_ROLE",
    "WATCHER_ROLE",
    "ARBITER_ROLE",
  ])
    assert.equal(await read("hasRole", [await read(role), accounts[1]]), false);
  const grants = receipt.logs
    .filter((l) => l.address.toLowerCase() === prepared.engine.toLowerCase())
    .map((l) => decodeEventLog({ abi: artifact.abi, topics: l.topics, data: l.data }));
  assert.equal(grants.length, 1);
  assert.equal(grants[0].eventName, "RoleGranted");
  assert.equal(grants[0].args.account.toLowerCase(), accounts[1].toLowerCase());
  await assert.rejects(
    rpc.call({ account: accounts[0], to: deploymentProxy, data: prepared.data, value: 0n }),
  );
});
test("salt/admin changes alter predicted engine and runtime tampering fails closed", async () => {
  const other = proxyDeployment(
    artifact,
    accounts[0],
    10000_000000n,
    100_000000n,
    keccak256(stringToHex("other QA salt")),
  );
  assert.notEqual(other.engine, prepared.engine);
  const code = await rpc.getBytecode({ address: prepared.engine });
  assert.throws(() => assertRuntime(artifact, "0x00"));
  assert.throws(() => assertRuntime(artifact, "0x00" + code.slice(4)));
  assert.throws(() => proxyDeployment(artifact, accounts[1], 1n, 1n, "0x00"));
});
