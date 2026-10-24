// Read-only receipt/source verification for a proxy-created private engine.
import fs from "node:fs";
import { createPublicClient, http, decodeEventLog, keccak256 } from "viem";
import { base } from "viem/chains";
import { compile } from "./compile.mjs";
import {
  deploymentProxy,
  assertDeploymentProxy,
  proxyDeployment,
  assertRuntime,
} from "./deployment-proxy.mjs";
const [file, hash] = process.argv.slice(2);
if (!file || !/^0x[0-9a-f]{64}$/i.test(hash ?? ""))
  throw Error("Usage: verify-mainnet-canary.mjs PLAN_JSON DEPLOYMENT_TX_HASH");
const plan = JSON.parse(fs.readFileSync(file, "utf8"));
if (
  plan.chainId !== 8453 ||
  plan.admin.toLowerCase() !== "0x57828f1aa32fd6be3988f240068df53ed94b7aef" ||
  plan.seedBudgetAtoms !== "10000000000" ||
  plan.grantBudgetAtoms !== "100000000"
)
  throw Error("Unapproved canary parameters");
const artifact = compile()["VirtualAMM.sol"].VirtualAMM;
const expected = proxyDeployment(
  artifact,
  plan.admin,
  BigInt(plan.seedBudgetAtoms),
  BigInt(plan.grantBudgetAtoms),
  plan.salt,
);
if (
  expected.engine.toLowerCase() !== plan.engine.toLowerCase() ||
  expected.initCodeHash !== plan.initCodeHash
)
  throw Error("Unexpected deployment artifact/address");
const c = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org", { timeout: 20000, retryCount: 1 }),
});
if ((await c.getChainId()) !== 8453) throw Error("Wrong chain");
const r = await c.getTransactionReceipt({ hash }),
  canonical = await c.getBlock({ blockNumber: r.blockNumber });
if (r.status !== "success" || r.blockHash.toLowerCase() !== canonical.hash.toLowerCase())
  throw Error("Noncanonical or failed deployment");
assertDeploymentProxy(
  await c.getBytecode({ address: deploymentProxy, blockNumber: r.blockNumber }),
);
if (await c.getBytecode({ address: expected.engine, blockNumber: r.blockNumber - 1n }))
  throw Error("Engine predates claimed deployment");
const code = await c.getBytecode({ address: expected.engine, blockNumber: r.blockNumber });
assertRuntime(artifact, code);
const read = (functionName, args = []) =>
  c.readContract({
    address: expected.engine,
    abi: artifact.abi,
    functionName,
    args,
    blockNumber: r.blockNumber,
  });
if (
  (await read("seedBudget")) !== BigInt(plan.seedBudgetAtoms) ||
  (await read("grantBudget")) !== BigInt(plan.grantBudgetAtoms)
)
  throw Error("Immutable budget mismatch");
const zero = "0x" + "0".repeat(64);
if (
  !(await read("hasRole", [zero, plan.admin])) ||
  (await read("hasRole", [zero, deploymentProxy]))
)
  throw Error("Wrong administrator");
const logs = r.logs
  .filter((l) => l.address.toLowerCase() === expected.engine.toLowerCase())
  .map((l) => decodeEventLog({ abi: artifact.abi, data: l.data, topics: l.topics }));
const created = logs.filter(
  (l) =>
    l.eventName === "RoleGranted" &&
    l.args.role === zero &&
    l.args.account.toLowerCase() === plan.admin.toLowerCase() &&
    l.args.sender.toLowerCase() === deploymentProxy,
);
if (created.length !== 1) throw Error("Missing constructor role evidence");
const state = {};
for (const name of ["poolCount", "campaignCount", "granted", "seeded", "totalCash"])
  state[name] = (await read(name)).toString();
if (Object.values(state).some((v) => v !== "0"))
  throw Error("Unexpected activation in deployment transaction");
const raw = await c.request({ method: "eth_getTransactionReceipt", params: [hash] });
const l2 = BigInt(raw.gasUsed) * BigInt(raw.effectiveGasPrice),
  l1 = raw.l1Fee ? BigInt(raw.l1Fee) : null;
const out = {
  chainId: 8453,
  verified: true,
  engine: expected.engine,
  admin: plan.admin,
  hash,
  blockNumber: r.blockNumber.toString(),
  blockHash: r.blockHash,
  runtimeCodeHash: keccak256(code),
  state,
  wholeTransactionL2FeeWei: l2.toString(),
  wholeTransactionL1FeeWei: l1?.toString() ?? null,
  note: "Whole-transaction fees may be paid by a bundler and are not proof of the wallet debit. Reconcile Base Account quote/receipt, UserOperation cost if applicable and operator fees before further expenditure. This verifies deployment only, not trading/live UI.",
};
fs.writeFileSync(
  "mainnet-canary-deployment-verification.json",
  JSON.stringify(out, null, 2) + "\n",
);
console.log(JSON.stringify(out, null, 2));
