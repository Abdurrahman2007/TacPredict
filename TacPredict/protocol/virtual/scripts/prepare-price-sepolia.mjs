// READ ONLY: compile, validate an operator-supplied plan, estimate and write unsigned calldata.
import fs from "node:fs";
import { createPublicClient, http, isAddress, encodeDeployData, keccak256 } from "viem";
import { baseSepolia } from "viem/chains";
import { compile } from "./compile.mjs";
const input = process.argv[2],
  output = process.argv[3];
if (!input || !output)
  throw Error("Usage: node scripts/prepare-price-sepolia.mjs plan.json unsigned.json");
const plan = JSON.parse(fs.readFileSync(input, "utf8"));
if (plan.chainId !== 84532 || !isAddress(plan.admin) || /^0x0{40}$/i.test(plan.admin))
  throw Error("Explicit Base Sepolia admin plan required");
for (const key of ["seedBudgetAtoms", "grantBudgetAtoms"])
  if (!/^\d{1,39}$/.test(plan[key]) || BigInt(plan[key]) < 1n)
    throw Error("Explicit positive virtual accounting budgets required");
if (BigInt(plan.seedBudgetAtoms) + BigInt(plan.grantBudgetAtoms) >= 2n ** 128n)
  throw Error("Budget range exceeded");
const rpc = process.env.VIRTUAL_TESTNET_RPC_URL;
if (!rpc) throw Error("VIRTUAL_TESTNET_RPC_URL required; never print secret RPC URLs");
const c = createPublicClient({
  chain: baseSepolia,
  transport: http(rpc, { timeout: 15000, retryCount: 1 }),
});
if ((await c.getChainId()) !== 84532) throw Error("RPC is not Base Sepolia");
const art = compile()["VirtualPriceAMM.sol"].VirtualPriceAMM;
const data = encodeDeployData({
  abi: art.abi,
  bytecode: "0x" + art.evm.bytecode.object,
  args: [plan.admin, BigInt(plan.seedBudgetAtoms), BigInt(plan.grantBudgetAtoms)],
});
const gas = await c.estimateGas({ account: plan.admin, data, value: 0n });
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      reviewOnly: true,
      chainId: 84532,
      from: plan.admin,
      to: null,
      value: "0x0",
      data,
      initCodeHash: keccak256(data),
      gasEstimate: gas.toString(),
      campaignsEnabled: false,
      tradingEnabled: false,
      warning:
        "Unsigned only. Wallet approval and test ETH are required. No Mainnet submission supported.",
    },
    null,
    2,
  ),
);
console.log("Unsigned Base Sepolia deployment prepared; no transaction submitted.");
