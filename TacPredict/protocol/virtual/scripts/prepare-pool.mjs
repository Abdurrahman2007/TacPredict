// Unsigned pool calldata; every economic parameter and timestamp is explicit input.
import fs from "node:fs";
import { encodeFunctionData, keccak256, stringToHex } from "viem";
import { compile } from "./compile.mjs";
const [metadataPath, termsPath] = process.argv.slice(2);
if (!metadataPath || !termsPath) throw Error("Usage: prepare-pool.mjs metadata.json terms.json");
const metadata = JSON.parse(fs.readFileSync(metadataPath)),
  terms = JSON.parse(fs.readFileSync(termsPath));
function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
const rulesHash = keccak256(stringToHex(canonical(metadata)));
const t = { rulesHash };
for (const k of [
  "openAt",
  "closeAt",
  "resolveAfter",
  "resolutionDeadline",
  "seed",
  "reserveFloor",
  "maxCashIn",
  "maxSharesIn",
  "maxPosition",
]) {
  if (terms[k] === undefined) throw Error("Missing " + k);
  t[k] = BigInt(terms[k]);
}
for (const k of ["challengePeriod", "feeBps", "outcomes"]) {
  if (terms[k] === undefined) throw Error("Missing " + k);
  t[k] = Number(terms[k]);
}
if (!Array.isArray(metadata.outcomes) || metadata.outcomes.length !== t.outcomes)
  throw Error("Outcome metadata mismatch");
const abi = compile()["VirtualAMM.sol"].VirtualAMM.abi;
fs.writeFileSync(
  "unsigned-pool.json",
  JSON.stringify(
    {
      broadcast: false,
      rulesHash,
      data: encodeFunctionData({ abi, functionName: "createPool", args: [t] }),
      note: "Review role, pool ID, metadata hash, caps, immutable rules and chain before any testnet signature.",
    },
    null,
    2,
  ) + "\n",
);
console.log("Prepared unsigned-pool.json. Nothing signed or submitted.");
