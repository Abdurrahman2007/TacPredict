import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ORIGINALS, generate, virtualName } from "../scripts/generate-virtual-set.mjs";

const contracts = path.resolve(import.meta.dirname, "../contracts");
const read = (file) => fs.readFileSync(path.join(contracts, file), "utf8");

test("the virtual set is exactly what the generator derives from the six production contracts", () => {
  const expected = generate(contracts);
  assert.deepEqual(Object.keys(expected).sort(), ORIGINALS.map((n) => `${virtualName(n)}.sol`).sort());
  for (const [file, content] of Object.entries(expected))
    assert.equal(read(file), content, `${file} drifted: run node scripts/generate-virtual-set.mjs`);
});

test("only the registry constructor and the exchange domain differ from production logic", () => {
  for (const name of ORIGINALS) {
    const original = read(`${name}.sol`).split("\n");
    const virtual = read(`${virtualName(name)}.sol`).split("\n");
    const normalised = virtual
      .filter((line) => !line.startsWith("// GENERATED") && !line.startsWith("// Virtual USDC set"))
      .map((line) => ORIGINALS.reduce((l, o) => l.replaceAll(virtualName(o), o), line));
    const extra = normalised.filter((line) => !original.includes(line));
    const missing = original.filter((line) => !normalised.includes(line));
    if (name === "MarketRegistry") {
      assert.equal(missing.length, 2, "only the two native-USDC pin lines are removed");
      assert.ok(missing.every((l) => /nativeUSDC/.test(l)));
      assert.ok(extra.some((l) => l.includes("isVirtualCollateral")));
    } else if (name === "Exchange") {
      // The only edit is the domain name, which the reverse rename above folds back to the original line.
      assert.deepEqual(missing, []);
      assert.ok(read("VirtualExchange.sol").includes('EIP712("TacPredictVirtualExchange", "1")'));
      assert.ok(!read("VirtualExchange.sol").includes('EIP712("TacPredictExchange"'));
    } else {
      assert.deepEqual(extra, [], `${name}: no added logic`);
      assert.deepEqual(missing, [], `${name}: no removed logic`);
    }
  }
});

test("the virtual set never references real USDC and the production contracts are untouched", () => {
  for (const name of ORIGINALS) {
    const text = read(`${virtualName(name)}.sol`);
    assert.ok(!/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913|0x036CbD53842c5426634e7929541eC2318f3dCF7e/.test(text), name);
  }
  // The production registry still pins native Base USDC; the virtual one must not be able to replace it.
  assert.ok(read("MarketRegistry.sol").includes('"Native Base USDC only"'));
  assert.ok(!read("VirtualMarketRegistry.sol").includes("Native Base USDC only"));
  assert.ok(read("VirtualMarketRegistry.sol").includes('"Virtual USDC only"'));
});

test("VirtualUSDC creates balance in three bounded ways and cannot be sent or pulled out by users", () => {
  const token = read("VirtualUSDC.sol");
  assert.equal([...token.matchAll(/\b_mint\(/g)].length, 3, "box, check-in and budgeted admin grant only");
  assert.ok(/function openBox\(\)[\s\S]*?_mint\(msg\.sender, amount\)/.test(token));
  assert.ok(/function checkIn\(\)[\s\S]*?_mint\(msg\.sender, amount\)/.test(token));
  assert.ok(/function adminGrant\([^)]*\)[\s\S]*?adminGrantedInSeason \+ amount <= adminSeasonBudget[\s\S]*?_mint\(account, amount\)/.test(token));
  assert.ok(!/function mint\b|function setBalance|function burn\b|function adminBurn|function adminTransfer/.test(token), "admin cannot take or edit balances");
  assert.equal([...token.matchAll(/\b_burn\(/g)].length, 1, "the only burn is the season reset inside openBox()");
  assert.ok(/function transfer\([^)]*\)[^{]*\{\s*require\(protocol\[msg\.sender\]/.test(token));
  assert.ok(/function transferFrom\([^)]*\)[^{]*\{\s*require\(protocol\[msg\.sender\]/.test(token));
  assert.ok(token.includes("BOX_MIN = 50_000_000") && token.includes("BOX_MAX = 500_000_000"), "box is 50 to 500 USDC");
  assert.ok(token.includes("CHECKIN_BASE = 20_000_000") && token.includes("CHECKIN_STEP = 10_000_000") && token.includes("CHECKIN_DAYS = 7"));
  assert.ok(token.includes('"vUSDC"'), "wallets must not show it as real USDC");
  assert.ok(!/permit|ERC20Permit/i.test(token));
  // Base only: the token and the virtual registry both refuse every chain except Base mainnet / Base Sepolia.
  assert.ok(token.includes('require(block.chainid == 8453 || block.chainid == 84532, "Base only")'));
  assert.ok(read("VirtualMarketRegistry.sol").includes('require(block.chainid == 8453 || block.chainid == 84532, "Base only")'));
});
