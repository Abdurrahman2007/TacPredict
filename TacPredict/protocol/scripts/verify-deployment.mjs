/** Read-only Base deployment verification. Never marks a database row verified. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  http,
  keccak256,
  stringToHex,
  encodeDeployData,
  isAddress,
  zeroAddress,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { verifyBaseAccountCreation } from "./base-account-proof.mjs";
export const contractNames = {
  registry: "MarketRegistry",
  factory: "MarketFactory",
  positions: "ConditionalPositions",
  exchange: "Exchange",
  oracle: "ResolutionOracle",
  settlement: "Settlement",
};
export function assertBaseChain(id) {
  if (id !== 8453 && id !== 84532) throw Error("Base Mainnet or Base Sepolia only");
}
export function matchesCompiledRuntime(code, artifact) {
  const template = artifact.deployedBytecode;
  if (!code || !template || code.length !== template.length) return false;
  const actual = Buffer.from(code.slice(2), "hex"),
    expected = Buffer.from(template.slice(2), "hex");
  for (const refs of Object.values(artifact.immutableReferences ?? {}))
    for (const ref of refs) {
      actual.fill(0, ref.start, ref.start + ref.length);
      expected.fill(0, ref.start, ref.start + ref.length);
    }
  return actual.equals(expected);
}
export async function verifyDeployment(pub, manifest, artifacts) {
  assertBaseChain(manifest.chain_id);
  if ((await pub.getChainId()) !== manifest.chain_id) throw Error("RPC chain mismatch");
  const official =
    manifest.chain_id === 8453
      ? "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
      : "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
  if (manifest.collateral_token?.toLowerCase() !== official)
    throw Error("Official native Base USDC required");
  if (!isAddress(manifest.admin) || manifest.admin.toLowerCase() === zeroAddress)
    throw Error("Reviewed admin address required");
  const addresses = Object.keys(contractNames).map((k) => manifest[k]?.toLowerCase());
  if (addresses.some((a) => !isAddress(a) || a === zeroAddress) || new Set(addresses).size !== 6)
    throw Error("Six distinct protocol contract addresses required");
  const batchReceipt =
    manifest.creation_mode === "base_account_create2"
      ? await verifyBaseAccountCreation(pub, manifest, artifacts)
      : null;
  const hashes = {},
    checks = [];
  for (const [key, name] of Object.entries(contractNames)) {
    const artifact = artifacts[name];
    const code = await pub.getBytecode({ address: manifest[key] });
    if (!matchesCompiledRuntime(code, artifact)) throw Error(`Compiled source mismatch: ${name}`);
    hashes[key] = keccak256(code);
    if (manifest.code_hashes?.[key] !== hashes[key])
      throw Error(`Manifest runtime hash mismatch: ${name}`);
    const deployment = manifest.deployment_transactions?.[key];
    if (!deployment?.txHash || !deployment.args)
      throw Error(`Creation transaction proof missing: ${name}`);
    if (batchReceipt) {
      if (batchReceipt.blockNumber < BigInt(manifest.deployment_block))
        throw Error("Creation block mismatch");
    } else {
      const [tx, receipt] = await Promise.all([
        pub.getTransaction({ hash: deployment.txHash }),
        pub.getTransactionReceipt({ hash: deployment.txHash }),
      ]);
      if (
        receipt.status !== "success" ||
        receipt.contractAddress?.toLowerCase() !== manifest[key].toLowerCase() ||
        tx.to !== null
      )
        throw Error(`Invalid creation receipt: ${name}`);
      const wanted = encodeDeployData({
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args: deployment.args,
      });
      if (tx.input.toLowerCase() !== wanted.toLowerCase())
        throw Error(`Constructor bytecode/arguments mismatch: ${name}`);
      if (receipt.blockNumber < BigInt(manifest.deployment_block))
        throw Error("Deployment block does not include all creations");
    }
    checks.push(name + ": source, constructor and receipt match");
  }
  const read = async (key, fn, args = []) =>
    pub.readContract({
      address: manifest[key],
      abi: artifacts[contractNames[key]].abi,
      functionName: fn,
      args,
    });
  for (const key of ["factory", "positions", "exchange", "oracle", "settlement"])
    if ((await read(key, "registry")).toLowerCase() !== manifest.registry.toLowerCase())
      throw Error(`Registry pointer mismatch: ${key}`);
  for (const key of ["exchange", "settlement"])
    if ((await read(key, "positions")).toLowerCase() !== manifest.positions.toLowerCase())
      throw Error(`Positions pointer mismatch: ${key}`);
  if ((await read("factory", "oracle")).toLowerCase() !== manifest.oracle.toLowerCase())
    throw Error("Factory oracle mismatch");
  if ((await read("registry", "collateralToken")).toLowerCase() !== official)
    throw Error("Registry collateral mismatch");
  for (const key of ["positions", "exchange", "oracle"])
    if ((await read(key, "usdc")).toLowerCase() !== official)
      throw Error("USDC pointer mismatch: " + key);
  const requireRole = async (key, role, address) => {
    if (
      !(await read(key, "hasRole", [
        role === "DEFAULT_ADMIN_ROLE" ? "0x" + "0".repeat(64) : keccak256(stringToHex(role)),
        address,
      ]))
    )
      throw Error(`Role missing: ${key}/${role}`);
  };
  for (const key of ["registry", "factory", "oracle"])
    await requireRole(key, "DEFAULT_ADMIN_ROLE", manifest.admin);
  await requireRole("registry", "FACTORY_ROLE", manifest.factory);
  await requireRole("registry", "ORACLE_ROLE", manifest.oracle);
  await requireRole("registry", "GUARDIAN_ROLE", manifest.guardian ?? manifest.admin);
  await requireRole("factory", "MARKET_CREATOR_ROLE", manifest.creator ?? manifest.admin);
  await requireRole("oracle", "PROPOSER_ROLE", manifest.proposer ?? manifest.admin);
  await requireRole("oracle", "ARBITER_ROLE", manifest.arbiter ?? manifest.admin);
  const tradingPaused = await read("registry", "tradingPaused");
  if (!manifest.trading_enabled && !tradingPaused)
    throw Error("Expected initial trading pause missing");
  const finalized = await pub.getBlock({ blockTag: "finalized" });
  for (const d of Object.values(manifest.deployment_transactions)) {
    const r = await pub.getTransactionReceipt({ hash: d.txHash });
    if (r.blockNumber > finalized.number) throw Error("Creation not finalized yet");
    const block = await pub.getBlock({ blockNumber: r.blockNumber });
    if (block.hash !== r.blockHash) throw Error("Receipt canonical block mismatch");
  }
  return {
    chainId: manifest.chain_id,
    sourceAndRolesVerified: true,
    audited: false,
    tradingActivated: false,
    tradingPaused,
    codeHashes: hashes,
    finalizedThrough: finalized.number.toString(),
    checks,
    warning:
      "Source/role verification is not an independent security audit. Registration and activation remain separate operator decisions.",
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file || !process.env.PROTOCOL_RPC_URL)
    throw Error("Usage: PROTOCOL_RPC_URL=... node verify-deployment.mjs manifest.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  assertBaseChain(manifest.chain_id);
  const root = path.resolve(import.meta.dirname, "../artifacts");
  const artifacts = Object.fromEntries(
    Object.values(contractNames).map((n) => [
      n,
      JSON.parse(fs.readFileSync(root + "/" + n + ".json", "utf8")),
    ]),
  );
  const pub = createPublicClient({
    chain: manifest.chain_id === 8453 ? base : baseSepolia,
    transport: http(process.env.PROTOCOL_RPC_URL),
  });
  const report = await verifyDeployment(pub, manifest, artifacts);
  fs.writeFileSync(file + ".verification.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
