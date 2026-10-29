/**
 * Prepare (and optionally broadcast) VirtualPriceAMM on Base Mainnet via CREATE2 proxy.
 * Default: unsigned plan only. Broadcast requires:
 *   VIRTUAL_MAINNET_DEPLOY_APPROVED=true
 *   VIRTUAL_DEPLOYER_PRIVATE_KEY=0x…
 * Uses VIRTUAL_RPC_URL / BASE_PROTOCOL_RPC_URL (Ankr). Never logs RPC secrets.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  formatEther,
  parseAbi,
  serializeTransaction,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { compile } from "./compile.mjs";
import { deploymentProxy, assertDeploymentProxy, proxyDeployment } from "./deployment-proxy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../launch/price-mainnet");
fs.mkdirSync(outDir, { recursive: true });

const admin = getAddress(
  process.env.VIRTUAL_ADMIN_ADDRESS || "0x57828f1aa32fd6be3988f240068df53ed94b7aef",
);
// Paper budgets: 10,000 seed + 1,000 grant Virtual USDC (6 decimals). Caps are immutable.
const seed = BigInt(process.env.VIRTUAL_SEED_BUDGET_ATOMS || "10000000000");
const grant = BigInt(process.env.VIRTUAL_GRANT_BUDGET_ATOMS || "1000000000");
const rpc = process.env.VIRTUAL_RPC_URL || process.env.BASE_PROTOCOL_RPC_URL;
if (!rpc) throw Error("VIRTUAL_RPC_URL or BASE_PROTOCOL_RPC_URL required");

const artifact = compile()["VirtualPriceAMM.sol"].VirtualPriceAMM;
const salt = keccak256(
  encodeAbiParameters(parseAbiParameters("string,uint256,address,uint128,uint128"), [
    "TacPredict-virtual-price-amm-paper-v1",
    8453n,
    admin,
    seed,
    grant,
  ]),
);
const deployment = proxyDeployment(artifact, admin, seed, grant, salt);
const client = createPublicClient({
  chain: base,
  transport: http(rpc, { timeout: 20000, retryCount: 1 }),
});
if ((await client.getChainId()) !== 8453) throw Error("RPC is not Base Mainnet");
assertDeploymentProxy(await client.getBytecode({ address: deploymentProxy }));

const existing = await client.getBytecode({ address: deployment.engine });
const plan = {
  scope: "VirtualPriceAMM paper trading only — does not touch the six verified legacy contracts",
  chainId: 8453,
  admin,
  seedBudgetAtoms: seed.toString(),
  grantBudgetAtoms: grant.toString(),
  factory: deploymentProxy,
  salt,
  engine: deployment.engine,
  initCodeHash: deployment.initCodeHash,
  runtimeCodeHash: null,
  calls: [{ to: deploymentProxy, value: "0x0", data: deployment.data }],
  broadcast: false,
  alreadyDeployed: Boolean(existing && existing !== "0x"),
  assets: ["BTC", "ETH", "SOL", "BNB"],
  note: "After deploy: grant CREATOR_ROLE + PROPOSER_ROLE, createPool ×4, configurePricePolicy, seed via createPool, set VIRTUAL_TRADING_CONFIG, apply virtual-v1.sql, run indexer.",
};

if (plan.alreadyDeployed) {
  const code = existing;
  plan.runtimeCodeHash = keccak256(code);
  fs.writeFileSync(path.join(outDir, "deployment.json"), JSON.stringify(plan, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: "ALREADY_DEPLOYED",
      engine: plan.engine,
      runtimeCodeHash: plan.runtimeCodeHash,
      path: "launch/price-mainnet/deployment.json",
    }),
  );
  process.exit(0);
}

const result = await client.call({
  account: admin,
  to: deploymentProxy,
  data: deployment.data,
  value: 0n,
});
if (result.data?.toLowerCase() !== deployment.engine.toLowerCase())
  throw Error("Unexpected CREATE2 result");

const [gas, fees, balance, nonce, block] = await Promise.all([
  client.estimateGas({
    account: admin,
    to: deploymentProxy,
    data: deployment.data,
    value: 0n,
    stateOverride: [{ address: admin, balance: 10n ** 18n }],
  }),
  client.estimateFeesPerGas(),
  client.getBalance({ address: admin }),
  client.getTransactionCount({ address: admin, blockTag: "pending" }),
  client.getBlockNumber(),
]);
const unsigned = serializeTransaction({
  chainId: 8453,
  type: "eip1559",
  nonce,
  gas,
  to: deploymentProxy,
  data: deployment.data,
  value: 0n,
  maxFeePerGas: fees.maxFeePerGas,
  maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
});
const l1 = await client.readContract({
  address: "0x420000000000000000000000000000000000000F",
  abi: parseAbi(["function getL1Fee(bytes) view returns (uint256)"]),
  functionName: "getL1Fee",
  args: [unsigned],
});
const targetMax = gas * fees.maxFeePerGas + l1;
Object.assign(plan, {
  observedBlock: block.toString(),
  balanceWei: balance.toString(),
  balanceEth: formatEther(balance),
  targetGasEstimate: gas.toString(),
  maxFeePerGasWei: fees.maxFeePerGas.toString(),
  approxUnsignedL1DataFeeWei: l1.toString(),
  targetMaxFeeEstimateEth: formatEther(targetMax),
  sufficientBalance: balance >= targetMax,
  unsignedTx: unsigned,
});

fs.writeFileSync(path.join(outDir, "unsigned-deployment.json"), JSON.stringify(plan, null, 2) + "\n");

const approved = process.env.VIRTUAL_MAINNET_DEPLOY_APPROVED === "true";
const key = process.env.VIRTUAL_DEPLOYER_PRIVATE_KEY;
if (!approved || !key) {
  console.log(
    JSON.stringify({
      status: "UNSIGNED_READY",
      engine: plan.engine,
      sufficientBalance: plan.sufficientBalance,
      balanceEth: plan.balanceEth,
      needEthApprox: plan.targetMaxFeeEstimateEth,
      path: "launch/price-mainnet/unsigned-deployment.json",
      next: "Fund admin, set VIRTUAL_MAINNET_DEPLOY_APPROVED=true and VIRTUAL_DEPLOYER_PRIVATE_KEY, re-run to broadcast",
    }),
  );
  process.exit(plan.sufficientBalance ? 0 : 2);
}

const account = privateKeyToAccount(key);
if (account.address.toLowerCase() !== admin.toLowerCase())
  throw Error("Deployer key does not match VIRTUAL_ADMIN_ADDRESS / plan admin");
const wallet = createWalletClient({ account, chain: base, transport: http(rpc) });
const hash = await wallet.sendTransaction({
  to: deploymentProxy,
  data: deployment.data,
  value: 0n,
  gas,
  maxFeePerGas: fees.maxFeePerGas,
  maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
});
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw Error("Deploy transaction reverted");
const code = await client.getBytecode({ address: deployment.engine });
if (!code || code === "0x") throw Error("Engine bytecode missing after deploy");
plan.broadcast = true;
plan.deploymentTx = hash;
plan.startBlock = receipt.blockNumber.toString();
plan.runtimeCodeHash = keccak256(code);
fs.writeFileSync(path.join(outDir, "deployment.json"), JSON.stringify(plan, null, 2) + "\n");
console.log(
  JSON.stringify({
    status: "DEPLOYED",
    engine: plan.engine,
    tx: hash,
    startBlock: plan.startBlock,
    runtimeCodeHash: plan.runtimeCodeHash,
  }),
);
