import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const root = path.resolve(import.meta.dirname, "..");
const outputDir = path.resolve(process.argv[2] || root + "/verification");
const require = createRequire(root + "/package.json");
const solc = require("solc");
const sources = Object.fromEntries(
  fs
    .readdirSync(root + "/contracts")
    .filter((f) => f.endsWith(".sol"))
    .map((f) => ["contracts/" + f, { content: fs.readFileSync(root + "/contracts/" + f, "utf8") }]),
);
const settings = {
  optimizer: { enabled: true, runs: 200 },
  viaIR: true,
  evmVersion: "shanghai",
  outputSelection: {
    "*": {
      "*": [
        "abi",
        "metadata",
        "evm.bytecode.object",
        "evm.deployedBytecode.object",
        "evm.deployedBytecode.immutableReferences",
      ],
    },
  },
};
const captured = {};
const out = JSON.parse(
  solc.compile(JSON.stringify({ language: "Solidity", sources, settings }), {
    import: (p) => {
      try {
        const content = fs.readFileSync(path.join(root, "node_modules", p), "utf8");
        captured[p] = { content };
        return { contents: content };
      } catch {
        return { error: "Missing dependency " + p };
      }
    },
  }),
);
if (out.errors?.some((e) => e.severity === "error")) throw Error("Compilation failed");
const all = { ...sources, ...captured };
const input = { language: "Solidity", sources: all, settings };
const second = JSON.parse(solc.compile(JSON.stringify(input)));
if (second.errors?.some((e) => e.severity === "error"))
  throw Error("Self-contained compilation failed");
const deployment = JSON.parse(fs.readFileSync(root + "/deployments/base-mainnet.json"));
const map = {
  registry: "MarketRegistry",
  factory: "MarketFactory",
  positions: "ConditionalPositions",
  exchange: "Exchange",
  oracle: "ResolutionOracle",
  settlement: "Settlement",
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputDir + "/standard-input.json", JSON.stringify(input));
for (const [key, name] of Object.entries(map)) {
  const c = second.contracts["contracts/" + name + ".sol"][name];
  const previous = JSON.parse(fs.readFileSync(root + "/artifacts/" + name + ".json"));
  if ("0x" + c.evm.bytecode.object !== previous.bytecode)
    throw Error("Exact original compiler bytecode mismatch " + name);
  const payload = {
    stdJsonInput: input,
    compilerVersion: solc.version().split(".Emscripten")[0],
    contractIdentifier: "contracts/" + name + ".sol:" + name,
    creationTransactionHash: deployment.tx_hash,
  };
  fs.writeFileSync(outputDir + "/" + key + ".json", JSON.stringify(payload));
  fs.writeFileSync(outputDir + "/" + key + "-metadata.json", c.metadata);
  console.log(key, "original creation bytecode exact; public payload ready");
}
console.log("Compiler", solc.version(), "source files", Object.keys(all).length);
