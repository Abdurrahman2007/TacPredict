import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compile } from "../scripts/compile.mjs";
import { parseAbi, toFunctionSelector } from "viem";

const art = compile().UpDownPool;
const read = (file) => fs.readFileSync(new URL(`../../src/lib/pool/${file}`, import.meta.url), "utf8");

test("the bytecode the admin panel deploys is exactly what the reviewed source compiles to", () => {
  const source = read("artifact.ts");
  const body = source.slice(source.indexOf("["), source.lastIndexOf("]"));
  const committed = [...body.matchAll(/"([0-9a-fA-F]+)"/g)].map((m) => m[1]).join("");
  assert.ok(committed.length > 2000, "bytecode is packaged");
  assert.equal(committed.toLowerCase(), art.evm.bytecode.object.toLowerCase());
});

test("the function list the app and admin panel call exists in the compiled contract", () => {
  const abi = read("abi.ts");
  const poolBlock = abi.slice(abi.indexOf("POOL_ABI_TEXT"), abi.indexOf("] as const;"));
  const text = [...poolBlock.matchAll(/"(function [^"]+)"/g)].map((m) => m[1]);
  const events = [...poolBlock.matchAll(/"event (\w+)\(/g)].map((m) => m[1]);
  for (const name of events)
    assert.ok(art.abi.some((item) => item.type === "event" && item.name === name), `event ${name} is not in the contract`);
  assert.ok(text.length >= 20, "ABI list is not empty");
  const compiled = new Map(
    art.abi
      .filter((item) => item.type === "function")
      .map((item) => [toFunctionSelector(item), item.stateMutability]),
  );
  for (const signature of text) {
    const [item] = parseAbi([signature]);
    const selector = toFunctionSelector(item);
    assert.ok(compiled.has(selector), `${signature} is not in the contract`);
    assert.equal(compiled.get(selector), item.stateMutability, `${signature} has another mutability`);
  }
});

test("the constructor takes admin, USDC, treasury and fee in that order", () => {
  const ctor = art.abi.find((item) => item.type === "constructor");
  assert.deepEqual(
    ctor.inputs.map((i) => `${i.type} ${i.name}`),
    ["address admin", "address usdc", "address treasury_", "uint256 feeBps_"],
  );
  const admin = fs.readFileSync(new URL("../../src/lib/pool/pool-admin.ts", import.meta.url), "utf8");
  assert.ok(admin.includes("address admin,address usdc,address treasury,uint256 feeBps"));
});
