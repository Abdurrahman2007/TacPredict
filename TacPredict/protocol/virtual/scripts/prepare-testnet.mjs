// Unsigned Base Sepolia deployment payload only. Never reads a key or sends a transaction.
import fs from "node:fs";
import { encodeDeployData, getAddress } from "viem";
import { compile } from "./compile.mjs";
const [admin, seedBudget, grantBudget] = process.argv.slice(2);
if (!admin || !/^\d+$/.test(seedBudget ?? "") || !/^\d+$/.test(grantBudget ?? ""))
  throw Error(
    "Usage: node scripts/prepare-testnet.mjs ADMIN SEED_BUDGET_ATOMS GRANT_BUDGET_ATOMS (explicit test-only caps)",
  );
const artifact = compile()["VirtualAMM.sol"].VirtualAMM;
const data = encodeDeployData({
  abi: artifact.abi,
  bytecode: "0x" + artifact.evm.bytecode.object,
  args: [getAddress(admin), BigInt(seedBudget), BigInt(grantBudget)],
});
fs.writeFileSync(
  "unsigned-sepolia-deployment.json",
  JSON.stringify(
    {
      chainId: 84532,
      from: getAddress(admin),
      data,
      value: "0",
      broadcast: false,
      note: "No automatic roles, campaigns, user grant or trading activation. Review caps and use test ETH only.",
    },
    null,
    2,
  ) + "\n",
);
console.log("Prepared unsigned-sepolia-deployment.json. Nothing deployed or signed.");
