/** Portable finalized-only indexer: no private key, signing or transaction submission. */
import { createPublicClient, http, decodeEventLog, keccak256, encodeAbiParameters } from "viem";
import { base, baseSepolia } from "viem/chains";
import { createDatabaseClient, withProtocolLease } from "./job-client.mjs";
import { createRequestBudget } from "./request-budget.mjs";
import { applyProjectedEvent } from "./indexer-projection-guard.mjs";
import { assertCanonicalBlock, assertFinalizedEventReceipt } from "./finalized-receipt-guard.mjs";

export async function runFinalizedIndexer(env, arts, maxChunks = 10) {
  if (!Number.isInteger(maxChunks) || maxChunks < 1 || maxChunks > 100)
    throw Error("Invalid indexer work bound");
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
  const budget = env.INDEXER_REQUEST_LIMIT
    ? createRequestBudget(Number(env.INDEXER_REQUEST_LIMIT))
    : null;
  const client = createPublicClient({
    chain: chainId === 8453 ? base : baseSepolia,
    transport: http(env.PROTOCOL_RPC_URL, { retryCount: 2, fetchFn: budget?.fetch }),
  });
  if ((await client.getChainId()) !== chainId) throw Error("RPC chain mismatch");

  const names = {
    registry: "MarketRegistry",
    factory: "MarketFactory",
    positions: "ConditionalPositions",
    exchange: "Exchange",
    oracle: "ResolutionOracle",
    settlement: "Settlement",
  };

  const db = createDatabaseClient(env, budget?.fetch);
  return await withProtocolLease(db, chainId, "indexer", async (lease) => {
    try {
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
      assertCanonicalBlock(finalized, finalized.number, finalized.number);
      if (checkpoint && BigInt(checkpoint.block_number) > finalized.number)
        throw Error("Checkpoint is beyond finalized head; halt");
      // Alchemy Free permits at most ten blocks per eth_getLogs request.
      const chunk = 10n;
      let applied = 0;
      let chunks = 0;
      for (; from <= finalized.number && chunks < maxChunks; from += chunk, chunks++) {
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
          if (log.blockNumber < from || log.blockNumber > to)
            throw Error("Log outside requested finalized chunk");
          assertFinalizedEventReceipt(log, receipt, block, finalized.number);
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
          const ok = await applyProjectedEvent(db, {
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
        assertCanonicalBlock(end, to, finalized.number);
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
        JSON.stringify({
          chainId,
          finalized: finalized.number.toString(),
          applied,
          through: previous,
          done: previous === finalized.number.toString(),
          lagBlocks: previous === null ? null : (finalized.number - BigInt(previous)).toString(),
        }),
      );
      return {
        chainId,
        finalized: finalized.number.toString(),
        applied,
        through: previous,
        done: previous === finalized.number.toString(),
        lagBlocks: previous === null ? null : (finalized.number - BigInt(previous)).toString(),
      };
    } finally {
      budget?.releaseReserve();
    }
  });
}

export { safeError } from "./job-client.mjs";
