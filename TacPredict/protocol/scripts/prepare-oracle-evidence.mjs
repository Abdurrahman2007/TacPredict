/** Usage: PROTOCOL_RPC_URL=... node scripts/prepare-oracle-evidence.mjs MARKET_ID spec.json output.json */
import fs from "node:fs";
import { createPublicClient, http, encodeFunctionData, keccak256 } from "viem";
import { base } from "viem/chains";
import { bindTerms, observeCandle, hashDocument } from "./oracle-observer-core.mjs";
import { safeError } from "./job-client.mjs";

async function main() {
  const [id, specPath, outputPath] = process.argv.slice(2);
  if (!/^[1-9]\d*$/.test(id || "") || !specPath || !outputPath || !process.env.PROTOCOL_RPC_URL)
    throw Error("Market ID, approved spec file, output path and private Base RPC required");
  const deployment = JSON.parse(
    fs.readFileSync(new URL("../deployments/base-mainnet.json", import.meta.url)),
  );
  if (deployment.chain_id !== 8453 || !deployment.verified)
    throw Error("Verified Base Mainnet only");
  const art = (name) =>
    JSON.parse(fs.readFileSync(new URL(`../artifacts/${name}.json`, import.meta.url)));
  const registry = art("MarketRegistry"),
    oracle = art("ResolutionOracle");
  const client = createPublicClient({ chain: base, transport: http(process.env.PROTOCOL_RPC_URL) });
  if ((await client.getChainId()) !== 8453) throw Error("Wrong RPC chain");
  for (const key of ["registry", "oracle"]) {
    const code = await client.getBytecode({ address: deployment[key] });
    if (!code || keccak256(code) !== deployment.code_hashes[key])
      throw Error("Runtime hash mismatch");
  }
  const market = await client.readContract({
    address: deployment.registry,
    abi: registry.abi,
    functionName: "getMarket",
    args: [BigInt(id)],
  });
  if (
    Number(market.status) !== 3 ||
    market.oracle.toLowerCase() !== deployment.oracle.toLowerCase()
  )
    throw Error("Market must be closed under the verified oracle");
  const metadataUrl = `https://tacpredict.fun/api/protocol/metadata/${market.metadataHash}`;
  const r = await fetch(metadataUrl, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Error("Approved immutable metadata unavailable");
  const metadata = await r.json(),
    spec = JSON.parse(fs.readFileSync(specPath));
  bindTerms(metadata, market, spec);
  const block = await client.getBlock();
  const observation = await observeCandle(spec, fetch, Number(block.timestamp));
  const evidence = {
    chainId: 8453,
    marketId: id,
    metadataHash: market.metadataHash,
    sourceHash: market.sourceHash,
    observation,
  };
  const evidenceHash = hashDocument(evidence);
  const bond = await client.readContract({
    address: deployment.oracle,
    abi: oracle.abi,
    functionName: "bond",
  });
  const challengePeriod = await client.readContract({
    address: deployment.oracle,
    abi: oracle.abi,
    functionName: "challengePeriod",
  });
  if (
    block.timestamp < market.resolveAfter ||
    block.timestamp + challengePeriod >= market.resolutionDeadline
  )
    throw Error("Proposal timing cannot satisfy immutable resolution deadline");
  const proposal = {
    chain: "base",
    calls: [
      {
        to: deployment.oracle,
        value: "0x0",
        data: encodeFunctionData({
          abi: oracle.abi,
          functionName: "propose",
          args: [
            BigInt(id),
            observation.outcome,
            false,
            evidenceHash,
            market.sourceHash,
            BigInt(observation.sourceTimestamp),
          ],
        }),
      },
    ],
  };
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        evidence,
        evidenceHash,
        proposal,
        requiredBondAtomic: bond.toString(),
        challengeSeconds: challengePeriod.toString(),
        status: "UNSIGNED_REQUIRES_ROLE_BALANCE_APPROVAL_AND_WALLET_CONFIRMATION",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      evidenceHash,
      outcome: observation.outcome,
      sourceTimestamp: observation.sourceTimestamp,
      signed: false,
      submitted: false,
    }),
  );
}
main().catch((e) => {
  console.error(safeError(e, process.env));
  process.exitCode = 1;
});
