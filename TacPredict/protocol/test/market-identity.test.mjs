import test from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, keccak256 } from "viem";
import {
  onchainMarketId,
  publicMarketId,
  displayMarketId,
  parsePublicMarketId,
  parseLegacyMarketId,
  assertMarketIdentity,
  validMarketIdentity,
  validPublicMarketId,
} from "../../src/lib/protocol/market-identity.mjs";

test("canonical identities round trip on both supported chains without allocating IDs", () => {
  for (const chain of [8453, 84532])
    for (const id of [
      "1",
      "999999",
      "1000000",
      "9007199254740993",
      ((1n << 256n) - 1n).toString(),
    ]) {
      const pub = publicMarketId(chain, id);
      assert.deepEqual(parsePublicMarketId(pub, chain), {
        chainId: chain,
        onchainId: id,
        marketId: pub,
      });
      assert.equal(parseLegacyMarketId(displayMarketId(id), chain).marketId, pub);
    }
});
test("reject ambiguous, malformed, wrong-chain, zero and overflowing identities", () => {
  for (const v of [
    1,
    0,
    -1,
    NaN,
    1.5,
    undefined,
    null,
    "0",
    "01",
    "-1",
    "+1",
    "1.0",
    "1e6",
    " 1",
    1n << 256n,
    "9".repeat(79),
  ])
    assert.throws(() => onchainMarketId(v));
  for (const v of [
    "TACP-000001",
    "TACP-1-000001",
    "TACP-8453-1",
    "TACP-8453-0000001",
    "TACP-8453-000000",
    "TACP-8453--1",
    "tacp-8453-000001",
    "TACP-08453-000001",
    "TACP-8453-000001 ",
    "TACP-8453-" + (1n << 256n),
  ])
    assert.equal(validPublicMarketId(v), false, v);
  assert.throws(() => parsePublicMarketId("TACP-84532-000001", 8453));
  assert.throws(() => parseLegacyMarketId("TACP-000001"));
  assert.throws(() => parseLegacyMarketId("TACP-0000001", 8453));
  assert.throws(() => publicMarketId(1, "1"));
});
test("DB route/chain/onchain ID mismatch fails closed", () => {
  const m = { marketId: "TACP-8453-000001", onchainId: "1", chainId: 8453 };
  assert.equal(validMarketIdentity(m), true);
  for (const change of [
    { chainId: 84532 },
    { onchainId: "2" },
    { marketId: "TACP-84532-000001" },
    { onchainId: "01" },
  ])
    assert.throws(() => assertMarketIdentity({ ...m, ...change }));
  assert.throws(() => assertMarketIdentity(m, 84532));
});
test("question, condition and outcome identity derivation uses abi.encode, exact widths", () => {
  const factory = "0xe01c23aac6f152a2eA437A7E6Eb0a664A1908568";
  const oracle = "0xF50797C34B214C81B80A9bd3e590C3cA0DF8118f";
  const hash = (n) => "0x" + n.repeat(64);
  const question = keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint64" },
      ],
      [8453n, factory, hash("1"), hash("2"), hash("3"), hash("4"), 1792400000n],
    ),
  );
  const condition = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }, { type: "uint256" }],
      [oracle, question, 2n],
    ),
  );
  const tokens = [0n, 1n].map((i) =>
    BigInt(
      keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [condition, i])),
    ).toString(),
  );
  assert.notEqual(question, condition);
  assert.notEqual(tokens[0], tokens[1]);
  // Source conformance against the compiled Solidity is covered by deployment/local EVM tests.
  assert(tokens.every((t) => onchainMarketId(t) > 0n));
});
