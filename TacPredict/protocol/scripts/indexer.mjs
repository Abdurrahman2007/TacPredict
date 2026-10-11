/** CLI adapter. Same fenced core is used by Cloudflare scheduled indexing. */
import fs from "node:fs";
import path from "node:path";
import { runFinalizedIndexer } from "./indexer-core.mjs";
import { safeError } from "./job-client.mjs";
const names = {
  registry: "MarketRegistry",
  factory: "MarketFactory",
  positions: "ConditionalPositions",
  exchange: "Exchange",
  oracle: "ResolutionOracle",
  settlement: "Settlement",
};
const dir = path.resolve(import.meta.dirname, "../artifacts");
const arts = Object.fromEntries(
  Object.entries(names).map(([k, n]) => [
    k,
    JSON.parse(fs.readFileSync(path.join(dir, n + ".json"), "utf8")),
  ]),
);
try {
  await runFinalizedIndexer(process.env, arts, 100);
} catch (error) {
  console.error(safeError(error, process.env));
  process.exitCode = 1;
}
