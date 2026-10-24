import type { Hex } from "viem";
import { virtualDb, checkpoint } from "./database.server";
import { virtualRuntime } from "./runtime.server";
import { indexVirtualRange, type IndexedBlock } from "./indexer-core";
export async function runVirtualIndexer(maxBlocks = 16) {
  const { deployment: d, client } = await virtualRuntime();
  const lease = await virtualDb.rpc("virtual_acquire_lease", { _deployment: d.id });
  if (lease.error || !lease.data) throw Error("Virtual indexer lease unavailable");
  const fence = String(lease.data);
  async function mutation(name: string, args: Record<string, unknown>) {
    const r = await virtualDb.rpc(name, { _deployment: d.id, _fence: fence, ...args });
    if (r.error) throw Error(`Virtual indexer ${name} rejected`);
  }
  const block = async (n: bigint): Promise<IndexedBlock> => {
    const b = await client.getBlock({ blockNumber: n });
    return { number: b.number, hash: b.hash, parentHash: b.parentHash, timestamp: b.timestamp };
  };
  const started = Date.now();
  try {
    const result = await indexVirtualRange(
      {
        block,
        head: () => client.getBlockNumber({ cacheTime: 0 }),
        finalized: async () => {
          const b = await client.getBlock({ blockTag: "finalized" });
          return {
            number: b.number,
            hash: b.hash,
            parentHash: b.parentHash,
            timestamp: b.timestamp,
          };
        },
        receipts: async (n) => {
          const logs = await client.getLogs({ address: d.engine, fromBlock: n, toBlock: n });
          const hashes = [...new Set(logs.map((l) => l.transactionHash))];
          return Promise.all(hashes.map((hash) => client.getTransactionReceipt({ hash })));
        },
      },
      {
        cursor: () => checkpoint(d.id),
        blockHash: async (n) => {
          const r = await virtualDb
            .from("virtual_blocks")
            .select("hash")
            .eq("deployment_id", d.id)
            .eq("number", n.toString())
            .eq("canonical", true)
            .maybeSingle();
          if (r.error) throw Error("Block journal unavailable");
          return r.data?.hash ?? null;
        },
        rewind: async (n, hash) =>
          mutation("virtual_rewind", { _number: n.toString(), _hash: hash }),
        commit: async (b, events, expected) =>
          mutation("virtual_commit_block", {
            _number: b.number.toString(),
            _hash: b.hash,
            _parent: b.parentHash,
            _timestamp: b.timestamp.toString(),
            _events: events,
            _expected: expected.toString(),
          }),
        finalize: async (n, hash: Hex) =>
          mutation("virtual_finalize_blocks", { _number: n.toString(), _hash: hash }),
      },
      d.engine,
      maxBlocks,
    );
    console.info(
      JSON.stringify({
        job: "virtual-indexer",
        status: "SUCCESS",
        chainId: d.chainId,
        checkpoint: result.checkpoint,
        blocks: result.blocks,
        durationMs: Date.now() - started,
      }),
    );
    return result;
  } catch (e) {
    console.error(
      JSON.stringify({
        job: "virtual-indexer",
        status: "FAILED",
        chainId: d.chainId,
        durationMs: Date.now() - started,
        code: "RPC_DATABASE_OR_RECONCILIATION_FAILURE",
      }),
    );
    throw e;
  } finally {
    await virtualDb.rpc("virtual_release_lease", { _deployment: d.id, _fence: fence });
  }
}
