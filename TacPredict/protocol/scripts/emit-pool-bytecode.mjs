/**
 * CI helper: prints the compiled UpDownPool creation bytecode as workflow notices so it can be
 * copied into src/lib/pool/artifact.ts and then verified by test/pool-artifact.test.mjs.
 * It only reads the compile output; it submits nothing and holds no keys.
 */
import fs from "node:fs";
import { keccak256 } from "viem";
const art = JSON.parse(fs.readFileSync(new URL("../artifacts/UpDownPool.json", import.meta.url), "utf8"));
const hex = art.bytecode;
console.log(`UpDownPool creation bytecode: ${(hex.length - 2) / 2} bytes, keccak ${keccak256(hex)}`);
const size = 20000;
for (let i = 0, n = 0; i < hex.length; i += size, n += 1)
  console.log(`::notice title=UpDownPool.bytecode.${n}::${hex.slice(i, i + size)}`);
