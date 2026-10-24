import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
export const root = fileURLToPath(new URL("../", import.meta.url));
export function compile(extra = {}) {
  const name = "VirtualAMM.sol";
  const sources = {
    [name]: { content: fs.readFileSync(path.join(root, "contracts", name), "utf8") },
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
  const artifact = compile()["VirtualAMM.sol"].VirtualAMM;
  fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "artifacts/VirtualAMM.json"),
    JSON.stringify(artifact, null, 2) + "\n",
  );
  console.log(
    "VirtualAMM compiled (Cancun); runtime bytes:",
    artifact.evm.deployedBytecode.object.length / 2,
  );
}
