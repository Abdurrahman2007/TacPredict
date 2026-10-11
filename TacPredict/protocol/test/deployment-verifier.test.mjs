import test from "node:test";
import assert from "node:assert/strict";
import { matchesCompiledRuntime, assertBaseChain } from "../scripts/verify-deployment.mjs";
test("only Base Mainnet and Base Sepolia pass deployment chain guard", () => {
  assertBaseChain(8453);
  assertBaseChain(84532);
  for (const id of [1, 137, 10, 42161, 31337]) assert.throws(() => assertBaseChain(id));
});
test("immutable placeholders are masked, executable instructions are never masked", () => {
  const artifact = {
    deployedBytecode: "0x6001000000005b",
    immutableReferences: { x: [{ start: 2, length: 4 }] },
  };
  assert(matchesCompiledRuntime("0x6001112233445b", artifact));
  assert.equal(matchesCompiledRuntime("0x6002112233445b", artifact), false);
  assert.equal(matchesCompiledRuntime("0x6001112233445a", artifact), false);
  assert.equal(matchesCompiledRuntime("0x6001112233445b00", artifact), false);
  assert.equal(matchesCompiledRuntime(undefined, artifact), false);
});
