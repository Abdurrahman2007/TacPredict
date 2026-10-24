import type { Hex, TransactionReceipt } from "viem";
import { decodeVirtualEvents } from "./receipt";
import type { VirtualEvent } from "./types";
export type IndexedBlock = { number: bigint; hash: Hex; parentHash: Hex; timestamp: bigint };
export type IndexerStore = {
  cursor: () => Promise<{ number: bigint; hash: string | null; finalized: bigint; start: bigint }>;
  blockHash: (n: bigint) => Promise<string | null>;
  rewind: (n: bigint, hash: string | null) => Promise<void>;
  commit: (block: IndexedBlock, events: VirtualEvent[], expected: bigint) => Promise<void>;
  finalize: (n: bigint, hash: Hex) => Promise<void>;
};
export type IndexerRpc = {
  block: (n: bigint) => Promise<IndexedBlock>;
  head: () => Promise<bigint>;
  finalized: () => Promise<IndexedBlock>;
  receipts: (n: bigint) => Promise<TransactionReceipt[]>;
};
export async function indexVirtualRange(
  rpc: IndexerRpc,
  store: IndexerStore,
  engine: Hex,
  maxBlocks = 16,
) {
  if (!Number.isInteger(maxBlocks) || maxBlocks < 1 || maxBlocks > 64)
    throw Error("Bounded index batch required");
  let c = await store.cursor();
  if (c.hash) {
    const onchain = await rpc.block(c.number);
    if (onchain.hash.toLowerCase() !== c.hash.toLowerCase()) {
      let n = c.number;
      let common: string | null = null;
      while (n >= c.start && n >= c.finalized && c.number - n <= 512n) {
        const saved = await store.blockHash(n);
        const actual = await rpc.block(n);
        if (saved && saved.toLowerCase() === actual.hash.toLowerCase()) {
          common = saved;
          break;
        }
        n--;
      }
      if (!common) {
        if (c.finalized >= c.start) throw Error("Finalized checkpoint mismatch: halted");
        n = c.start - 1n;
      }
      if (n < c.finalized) throw Error("Finalized reorg: halted");
      await store.rewind(n, common);
      c = await store.cursor();
    }
  }
  const head = await rpc.head();
  let count = 0;
  while (c.number < head && count < maxBlocks) {
    const b = await rpc.block(c.number + 1n);
    if (c.hash && b.parentHash.toLowerCase() !== c.hash.toLowerCase())
      throw Error("Parent hash changed: retry reconciliation");
    const receipts = await rpc.receipts(b.number);
    const events: VirtualEvent[] = [];
    for (const receipt of receipts) {
      if (
        receipt.blockHash.toLowerCase() !== b.hash.toLowerCase() ||
        receipt.blockNumber !== b.number
      )
        throw Error("Noncanonical receipt");
      events.push(...decodeVirtualEvents(receipt, engine));
    }
    if ((await rpc.block(b.number)).hash.toLowerCase() !== b.hash.toLowerCase())
      throw Error("Block reorged during verification");
    events.sort((a, b) => a.logIndex - b.logIndex);
    const ids = new Set<string>();
    for (const e of events) {
      const key = `${e.txHash}:${e.logIndex}`;
      if (ids.has(key)) throw Error("Duplicate log in block");
      ids.add(key);
    }
    await store.commit(b, events, c.number);
    c = await store.cursor();
    count++;
  }
  const final = await rpc.finalized();
  const target = final.number < c.number ? final.number : c.number;
  if (target >= c.start && target > c.finalized) {
    const saved = await store.blockHash(target),
      actual = await rpc.block(target);
    if (!saved || saved.toLowerCase() !== actual.hash.toLowerCase())
      throw Error("Finality reconciliation mismatch");
    await store.finalize(target, actual.hash);
  }
  return { blocks: count, checkpoint: c.number.toString() };
}
