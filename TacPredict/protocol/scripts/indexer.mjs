/** Run only after deployment review. Financial writes come solely from finalized receipts. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, decodeEventLog, keccak256, encodeAbiParameters } from "viem";
import { base, baseSepolia } from "viem/chains";
import { createDatabaseClient, withProtocolLease, safeError } from "./job-client.mjs";
const env = process.env;
for (const k of [
  "PROTOCOL_RPC_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PROTOCOL_CHAIN_ID",
])
  if (!env[k]) throw Error(`Missing ${k}`);
if (new URL(env.SUPABASE_URL).hostname !== "lmqaiqvwcytmgwgwyfwx.supabase.co")
  throw Error("Wrong main project");
const chainId = Number(env.PROTOCOL_CHAIN_ID);
if (![8453, 84532].includes(chainId)) throw Error("Unsupported chain");
const client = createPublicClient({
  chain: chainId === 8453 ? base : baseSepolia,
  transport: http(env.PROTOCOL_RPC_URL, { retryCount: 2 }),
});
if ((await client.getChainId()) !== chainId) throw Error("RPC chain mismatch");
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../artifacts");
const names = {
  registry: "MarketRegistry",
  factory: "MarketFactory",
  positions: "ConditionalPositions",
  exchange: "Exchange",
  oracle: "ResolutionOracle",
  settlement: "Settlement",
};
const arts = Object.fromEntries(
  Object.entries(names).map(([k, n]) => [
    k,
    JSON.parse(fs.readFileSync(path.join(dir, n + ".json"), "utf8")),
  ]),
);
const db = createDatabaseClient(env);
try {
  await withProtocolLease(db, chainId, "indexer", async (lease) => {
    const [deployment] = await db(
      "protocol_deployments",
      undefined,
      `?select=*,deployment_block::text&chain_id=eq.${chainId}&verified=eq.true`,
    );
    if (!deployment) throw Error("No verified deployment; refusing to index");
    for (const k of Object.keys(names)) {
      const code = await client.getBytecode({ address: deployment[k] });
      if (!code || !deployment.code_hashes[k] || keccak256(code) !== deployment.code_hashes[k])
        throw Error(`Bytecode mismatch: ${k}`);
    }
    if (
      (
        await client.readContract({
          address: deployment.registry,
          abi: arts.registry.abi,
          functionName: "collateralToken",
        })
      ).toLowerCase() !== deployment.collateral_token.toLowerCase()
    )
      throw Error("Collateral mismatch");
    const [checkpoint] = await db(
      "protocol_indexer_checkpoints",
      undefined,
      `?select=*,block_number::text&chain_id=eq.${chainId}`,
    );
    if (checkpoint) {
      const b = await client.getBlock({ blockNumber: BigInt(checkpoint.block_number) });
      if (b.hash !== checkpoint.block_hash)
        throw Error("Finalized checkpoint changed; halt and investigate, no automatic rollback");
    }
    const stringify = (v) =>
      JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));
    const allowed = new Set([
      "MarketCreated",
      "MarketClosed",
      "ResolutionFinalized",
      "TransferSingle",
      "TransferBatch",
      "PositionCreated",
      "CompleteSetMerged",
      "PositionRedeemed",
      "OrderFilled",
      "OrderCancelled",
      "NonceInvalidated",
      "TradeExecuted",
      "ResolutionProposed",
      "ResolutionDisputed",
      "DisputeFinalized",
      "BondWithdrawn",
      "MetadataPublished",
    ]);
    let previous = checkpoint ? String(checkpoint.block_number) : null;
    let from = checkpoint
      ? BigInt(checkpoint.block_number) + 1n
      : BigInt(deployment.deployment_block);
    const finalized = await client.getBlock({ blockTag: "finalized" });
    const chunk = 200n;
    let applied = 0;
    for (; from <= finalized.number; from += chunk) {
      await lease.assert();
      const to = from + chunk - 1n > finalized.number ? finalized.number : from + chunk - 1n;
      const logs = await client.getLogs({
        address: Object.keys(names).map((k) => deployment[k]),
        fromBlock: from,
        toBlock: to,
      });
      logs.sort(
        (a, b) =>
          Number(a.blockNumber - b.blockNumber) ||
          a.transactionIndex - b.transactionIndex ||
          a.logIndex - b.logIndex,
      );
      for (const log of logs) {
        const key = Object.keys(names).find(
          (k) => deployment[k].toLowerCase() === log.address.toLowerCase(),
        );
        let decoded;
        try {
          decoded = decodeEventLog({
            abi: arts[key].abi,
            data: log.data,
            topics: log.topics,
            strict: true,
          });
        } catch {
          throw Error("Unknown event ABI; halt rather than silently lose financial data");
        }
        if (!allowed.has(decoded.eventName)) continue;
        const [receipt, block] = await Promise.all([
          client.getTransactionReceipt({ hash: log.transactionHash }),
          client.getBlock({ blockNumber: log.blockNumber }),
        ]);
        if (
          receipt.status !== "success" ||
          receipt.blockHash !== block.hash ||
          log.blockHash !== block.hash ||
          log.removed ||
          !receipt.logs.some(
            (l) =>
              l.logIndex === log.logIndex &&
              l.address.toLowerCase() === log.address.toLowerCase() &&
              l.data === log.data,
          )
        )
          throw Error("Invalid finalized receipt");
        let payload = stringify(decoded.args);
        if (decoded.eventName === "MarketCreated") {
          const m = await client.readContract({
            address: deployment.registry,
            abi: arts.registry.abi,
            functionName: "getMarket",
            args: [BigInt(payload.marketId)],
            blockNumber: log.blockNumber,
          });
          payload = {
            ...payload,
            ...stringify(m),
            tokenIds: Array.from({ length: Number(m.outcomeCount) }, (_, i) =>
              BigInt(
                keccak256(
                  encodeAbiParameters(
                    [{ type: "bytes32" }, { type: "uint256" }],
                    [m.conditionId, BigInt(i)],
                  ),
                ),
              ).toString(),
            ),
          };
        }
        const ok = await db("rpc/apply_leased_protocol_event", {
          _owner: lease.owner,
          _chain: chainId,
          _block: log.blockNumber.toString(),
          _block_hash: block.hash,
          _tx: log.transactionHash.toLowerCase(),
          _log: log.logIndex,
          _contract: log.address.toLowerCase(),
          _event: decoded.eventName,
          _payload: payload,
          _timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        });
        if (ok) applied++;
      }
      const end = await client.getBlock({ blockNumber: to });
      await db("rpc/advance_protocol_checkpoint", {
        _owner: lease.owner,
        _chain: chainId,
        _expected_block: previous,
        _block: to.toString(),
        _hash: end.hash,
      });
      previous = to.toString();
      console.log(JSON.stringify({ chainId, through: to.toString(), applied }));
    }
    console.log(
      JSON.stringify({ chainId, finalized: finalized.number.toString(), applied, done: true }),
    );
  });
} catch (error) {
  console.error(safeError(error, env));
  process.exitCode = 1;
}
