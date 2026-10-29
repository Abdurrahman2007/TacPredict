// Read-only preparation for the user's explicitly approved PRIVATE canary.
// No signer, private key, wallet submission or production configuration mutation.
import fs from "node:fs";
import {
  createPublicClient,
  http,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  formatEther,
  parseAbi,
  serializeTransaction,
} from "viem";
import { base } from "viem/chains";
import { compile } from "./compile.mjs";
import { deploymentProxy, assertDeploymentProxy, proxyDeployment } from "./deployment-proxy.mjs";
const admin = "0x57828f1aa32fd6be3988f240068df53ed94b7aef";
const seed = 10000_000000n,
  grant = 100_000000n,
  budget = 100000000000000n;
const artifact = compile()["VirtualAMM.sol"].VirtualAMM;
const salt = keccak256(
  encodeAbiParameters(parseAbiParameters("string,uint256,address"), [
    "TacPredict-approved-private-canary-2026-10-24-v1",
    8453n,
    admin,
  ]),
);
const deployment = proxyDeployment(artifact, admin, seed, grant, salt);
const c = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org", { timeout: 20000, retryCount: 1 }),
});
if ((await c.getChainId()) !== 8453) throw Error("Wrong chain");
assertDeploymentProxy(await c.getBytecode({ address: deploymentProxy }));
if (await c.getBytecode({ address: deployment.engine }))
  throw Error("Predicted address already has code; verify evidence before any retry");
const result = await c.call({
  account: admin,
  to: deploymentProxy,
  data: deployment.data,
  value: 0n,
});
if (result.data?.toLowerCase() !== deployment.engine.toLowerCase())
  throw Error("Unexpected deployment result");
const [gas, fees, gasPrice, balance, nonce, block] = await Promise.all([
  c.estimateGas({
    account: admin,
    to: deploymentProxy,
    data: deployment.data,
    value: 0n,
    stateOverride: [{ address: admin, balance: 10n ** 18n }],
  }),
  c.estimateFeesPerGas(),
  c.getGasPrice(),
  c.getBalance({ address: admin }),
  c.getTransactionCount({ address: admin, blockTag: "pending" }),
  c.getBlockNumber(),
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
const l1 = await c.readContract({
  address: "0x420000000000000000000000000000000000000F",
  abi: parseAbi(["function getL1Fee(bytes) view returns (uint256)"]),
  functionName: "getL1Fee",
  args: [unsigned],
});
const targetMax = gas * fees.maxFeePerGas + l1;
const plan = {
  scope: "PRIVATE Base Mainnet canary only; no public launch or production configuration changes",
  chainId: 8453,
  admin,
  seedBudgetAtoms: seed.toString(),
  grantBudgetAtoms: grant.toString(),
  maximumCumulativeGasWei: budget.toString(),
  spentByThisSessionWei: "0",
  factory: deploymentProxy,
  salt,
  engine: deployment.engine,
  initCodeHash: deployment.initCodeHash,
  calls: [{ to: deploymentProxy, value: "0x0", data: deployment.data }],
  readOnly: true,
  broadcast: false,
  observedBlock: block.toString(),
  observedAtUtc: new Date().toISOString(),
  balanceWei: balance.toString(),
  balanceEth: formatEther(balance),
  targetGasEstimate: gas.toString(),
  gasPriceWei: gasPrice.toString(),
  maxFeePerGasWei: fees.maxFeePerGas.toString(),
  approxUnsignedL1DataFeeWei: l1.toString(),
  targetMaxFeeEstimateEth: formatEther(targetMax),
  estimateUsesSimulatedBalance: true,
  simulatedResultMatches: true,
  factoryRuntimeVerified: true,
  sufficientForTargetEstimate: balance >= targetMax,
  withinApprovedCap: targetMax <= budget,
  submissionBlocked: balance < targetMax || targetMax > budget,
  note: "Target-call estimate excludes smart-wallet execution/bundler overhead and signature-dependent L1 changes. Obtain current full wallet fee quote before approval. Reject if total previous actual fees plus maximum new fee exceeds 0.0001 ETH. Never batch Buy/Sell; deploy is one call, each trade is a later separate transaction. No value is sent to the factory.",
};
fs.writeFileSync("mainnet-canary-plan.json", JSON.stringify(plan, null, 2) + "\n");
console.log(JSON.stringify({ ...plan, calls: "saved in mainnet-canary-plan.json" }, null, 2));
