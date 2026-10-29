import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
export const root = fileURLToPath(new URL("../", import.meta.url));
export function compile(extra = {}) {
  const name = "VirtualAMM.sol";
  const sources = {
    [name]: { content: fs.readFileSync(path.join(root, "contracts", name), "utf8") },
    "VirtualPriceAMM.sol": {
      content: fs.readFileSync(path.join(root, "contracts", "VirtualPriceAMM.sol"), "utf8"),
    },
    ...extra,
  };
  const result = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources,
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: "cancun",
          outputSelection: {
            "*": {
              "*": [
                "abi",
                "evm.bytecode.object",
                "evm.deployedBytecode.object",
                "evm.deployedBytecode.immutableReferences",
              ],
            },
          },
        },
      }),
      {
        import(p) {
          try {
            return { contents: fs.readFileSync(path.join(root, "node_modules", p), "utf8") };
          } catch {
            return { error: "Missing import " + p };
          }
        },
      },
    ),
  );
  const errors = (result.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) throw Error(errors.map((e) => e.formattedMessage).join("\n"));
  return result.contracts;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const contracts = compile();
  fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
  for (const name of ["VirtualAMM", "VirtualPriceAMM"]) {
    const artifact = contracts[name + ".sol"][name];
    fs.writeFileSync(
      path.join(root, "artifacts", name + ".json"),
      JSON.stringify(artifact, null, 2) + "\n",
    );
    const bytes = artifact.evm.deployedBytecode.object.length / 2;
    if (bytes > 24576) throw Error(name + " exceeds EIP-170");
    console.log(name + " compiled (Cancun); runtime bytes:", bytes);
  }
}
