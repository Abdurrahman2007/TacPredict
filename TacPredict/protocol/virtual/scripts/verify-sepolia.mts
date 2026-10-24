// READ ONLY. No wallet/private key or transaction-submission code.
import fs from "node:fs";
import {
  createPublicClient,
  http,
  keccak256,
  encodeDeployData,
  type Address,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
import { virtualAmmAbi } from "../../../src/lib/virtual/abi.ts";
import { verifyTradeReceipt } from "../../../src/lib/virtual/receipt.ts";
// @ts-ignore reviewed standalone JS compiler
import { compile } from "./compile.mjs";
const file = process.argv[2];
if (!file) throw Error("Usage: verify-sepolia.mts evidence-input.json");
const input = JSON.parse(fs.readFileSync(file, "utf8"));
const out: Record<string, unknown> = {
  network: "Base Sepolia",
  chainId: 84532,
  readOnly: true,
  verified: false,
};
try {
  const c = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env["VIRTUAL_TESTNET_RPC_URL"] ?? "https://sepolia.base.org", {
      timeout: 15000,
      retryCount: 1,
    }),
  });
  if ((await c.getChainId()) !== 84532) throw Error();
  const a = input.engine as Address,
    art = compile()["VirtualAMM.sol"].VirtualAMM;
  const [code, deployment, transaction] = await Promise.all([
    c.getBytecode({ address: a }),
    c.getTransactionReceipt({ hash: input.deployTx }),
    c.getTransaction({ hash: input.deployTx }),
  ]);
  if (
    !code ||
    deployment.status !== "success" ||
    deployment.contractAddress?.toLowerCase() !== a.toLowerCase() ||
    transaction.to !== null
  )
    throw Error();
  const expected = encodeDeployData({
    abi: art.abi,
    bytecode: ("0x" + art.evm.bytecode.object) as Hex,
    args: [input.admin, BigInt(input.seedBudgetAtoms), BigInt(input.grantBudgetAtoms)],
  });
  if (transaction.input.toLowerCase() !== expected.toLowerCase()) throw Error();
  let actual = code.slice(2),
    compiled = art.evm.deployedBytecode.object;
  for (const refs of Object.values(art.evm.deployedBytecode.immutableReferences ?? {}) as {
    start: number;
    length: number;
  }[][])
    for (const { start, length } of refs) {
      actual =
        actual.slice(0, start * 2) + "0".repeat(length * 2) + actual.slice((start + length) * 2);
      compiled =
        compiled.slice(0, start * 2) +
        "0".repeat(length * 2) +
        compiled.slice((start + length) * 2);
    }
  if (actual.toLowerCase() !== compiled.toLowerCase()) throw Error();
  for (const [functionName, value] of [
    ["seedBudget", input.seedBudgetAtoms],
    ["grantBudget", input.grantBudgetAtoms],
  ] as const) {
    const v = await c.readContract({ address: a, abi: virtualAmmAbi, functionName });
    if (v !== BigInt(value)) throw Error();
  }
  const adminRole = ("0x" + "0".repeat(64)) as Hex;
  if (
    !(await c.readContract({
      address: a,
      abi: virtualAmmAbi,
      functionName: "hasRole",
      args: [adminRole, input.admin],
    }))
  )
    throw Error();
  const seen = new Set<string>(),
    receipts = [];
  for (const item of input.trades ?? []) {
    if (seen.has(item.hash.toLowerCase())) throw Error();
    seen.add(item.hash.toLowerCase());
    const r = await c.getTransactionReceipt({ hash: item.hash });
    const b = await c.getBlock({ blockNumber: r.blockNumber });
    const final = await c.getBlock({ blockTag: "finalized" });
    const result = verifyTradeReceipt(r, a, item, b.hash, final.number);
    if (!["confirmed", "finalized"].includes(result.status)) throw Error();
    receipts.push({
      hash: r.transactionHash,
      blockNumber: r.blockNumber.toString(),
      blockHash: r.blockHash,
      status: result.status,
      gasUsed: r.gasUsed.toString(),
      side: item.isBuy ? "buy" : "sell",
      wallet: item.wallet,
      marketId: item.marketId,
      nonce: item.nonce,
    });
  }
  Object.assign(out, {
    verified: true,
    engine: a,
    runtimeCodeHash: keccak256(code),
    deployment: {
      hash: deployment.transactionHash,
      block: deployment.blockNumber.toString(),
      gasUsed: deployment.gasUsed.toString(),
    },
    receipts,
    completeTradeSmoke:
      receipts.some((r) => r.side === "buy") && receipts.some((r) => r.side === "sell"),
    note: "Source/deployment/receipt checks only, not an independent audit, market-data or full launch approval.",
  });
} catch {
  out.error = "SEPOLIA_RPC_SOURCE_DEPLOYMENT_OR_RECEIPT_CHECK_FAILED";
  process.exitCode = 1;
}
fs.writeFileSync("sepolia-verification.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ verified: out.verified, output: "sepolia-verification.json" }));
