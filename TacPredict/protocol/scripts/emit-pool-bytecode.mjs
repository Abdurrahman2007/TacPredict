/**
 * CI helper: prints the compiled UpDownPool creation bytecode as workflow notices so it can be
 * copied into src/lib/pool/artifact.ts and then verified by test/pool-artifact.test.mjs.
 * It only reads the compile output; it submits nothing and holds no keys.
 * Usage: node emit-pool-bytecode.mjs <firstChunk> <chunkCount>   (GitHub allows 10 notices per step)
 */
import fs from "node:fs";
import { keccak256 } from "viem";
const art = JSON.parse(fs.readFileSync(new URL("../artifacts/UpDownPool.json", import.meta.url), "utf8"));
const hex = art.bytecode;
const first = Number(process.argv[2] ?? 0);
const count = Number(process.argv[3] ?? 10);
const size = 3000;
const chunks = Math.ceil(hex.length / size);
if (first === 0)
  console.log(
    `::notice title=UpDownPool.info::bytes=${(hex.length - 2) / 2} chunks=${chunks} chunkSize=${size} keccak=${keccak256(hex)}`,
  );
for (let n = first; n < Math.min(chunks, first + count); n += 1)
  console.log(`::notice title=UpDownPool.bytecode.${String(n).padStart(3, "0")}::${hex.slice(n * size, (n + 1) * size)}`);
