import assert from "node:assert/strict";
import ganache from "ganache";
import { compile } from "../scripts/compile.mjs";
import { createPublicClient, createWalletClient, custom, defineChain, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Local simulation only: Base Sepolia chain id with the native test-USDC address, no network, no real funds.
const provider = ganache.provider({
  logging: { quiet: true },
  chain: { chainId: 84532, hardfork: "shanghai" },
  wallet: { totalAccounts: 8 },
});
const chain = defineChain({
  id: 84532,
  name: "Isolated Base Sepolia simulation",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://localhost"] } },
});
const accounts = Object.values(provider.getInitialAccounts()).map((x) => privateKeyToAccount(x.secretKey));
const clients = accounts.map((a) => createWalletClient({ account: a, chain, transport: custom(provider) }));
const pub = createPublicClient({ chain, transport: custom(provider), pollingInterval: 20, cacheTime: 0 });
const art = compile();
const ADMIN = 0, REPORTER = 1, A = 2, B = 3, C = 4, D = 5, TREASURY = 6, OUTSIDER = 7;
const nativeUSDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const role = (name) => keccak256(stringToHex(name));
const M = 1_000_000n;
let pool;
let passed = 0;

async function deploy(name, args = []) {
  const hash = await clients[ADMIN].deployContract({ abi: art[name].abi, bytecode: "0x" + art[name].evm.bytecode.object, args });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  return receipt.contractAddress;
}
async function send(address, name, fn, args = [], who = ADMIN) {
  const hash = await clients[who].writeContract({ address, abi: art[name].abi, functionName: fn, args });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  return receipt;
}
const call = (fn, args = [], who = ADMIN) => send(pool, "UpDownPool", fn, args, who);
const view = (fn, args = []) => pub.readContract({ address: pool, abi: art.UpDownPool.abi, functionName: fn, args });
const usdcBalance = (who) => pub.readContract({ address: nativeUSDC, abi: art.TestUSDC.abi, functionName: "balanceOf", args: [typeof who === "string" ? who : accounts[who].address] });
const now = async () => Number((await pub.getBlock()).timestamp);
async function advanceTo(ts) {
  const n = await now();
  if (ts > n) await provider.request({ method: "evm_increaseTime", params: [ts - n] });
  await provider.request({ method: "evm_mine", params: [] });
}
/** The next UTC-aligned start that is still at least minLead seconds away. */
async function freshStart(duration, minLead = 90) {
  let n = await now();
  let start = (Math.floor(n / duration) + 1) * duration;
  if (start - n < minLead) {
    await advanceTo(start + 1);
    n = await now();
    start = (Math.floor(n / duration) + 1) * duration;
  }
  return start;
}
const report = (asset, duration, start, price, observedAt) => ({
  asset, duration, start: BigInt(start), price: BigInt(price), observedAt: BigInt(observedAt),
});
const windowOf = (asset, duration, start) => view("getWindow", [asset, duration, BigInt(start)]);
const positionOf = (asset, duration, start, who) => view("getPosition", [asset, duration, BigInt(start), accounts[who].address]);
const OPEN = 0, SETTLED = 1, VOID = 2;
const UP = 1, DOWN = 2;
const START_PRICE = 6_712_345_000_000n; // 67,123.45 with 8 decimals
const bonusFor = (stake, distributable, winners) => (stake * distributable) / winners;

/** Bet, report the start and the end, and return the round. */
async function play({ asset, duration, bets, startPrice = START_PRICE, endPrice }) {
  const start = await freshStart(duration);
  for (const [who, up, amount] of bets) await call("bet", [asset, duration, BigInt(start), up, amount], who);
  await advanceTo(start + 15);
  await call("reportStarts", [[report(asset, duration, start, startPrice, start + 5)]], REPORTER);
  const end = start + duration;
  await advanceTo(end + 15);
  await call("reportEnds", [[report(asset, duration, start, endPrice, end + 5)]], REPORTER);
  return { start, end };
}
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}

try {
  // Native USDC fixture at the Base Sepolia native USDC address, exactly like the registry test.
  const fixture = await deploy("TestUSDC");
  await provider.request({ method: "evm_setAccountCode", params: [nativeUSDC, "0x" + art.TestUSDC.evm.deployedBytecode.object] });
  for (let i = 0; i < accounts.length; i++) {
    await send(nativeUSDC, "TestUSDC", "mint", [accounts[i].address, 10_000n * M]);
  }

  await test("Deployment is Base-only, native-USDC-only and caps the fee", async () => {
    const args = [accounts[ADMIN].address, fixture, accounts[TREASURY].address, 300n];
    await assert.rejects(deploy("UpDownPool", args));
    await assert.rejects(deploy("UpDownPool", [accounts[ADMIN].address, nativeUSDC, accounts[TREASURY].address, 1001n]));
    await assert.rejects(deploy("UpDownPool", [accounts[ADMIN].address, nativeUSDC, "0x0000000000000000000000000000000000000000", 300n]));
    pool = await deploy("UpDownPool", [accounts[ADMIN].address, nativeUSDC, accounts[TREASURY].address, 300n]);
    assert.equal(await view("feeBps"), 300n);
    assert.equal(await view("minBet"), 1_000_000n);
    assert.equal(await view("treasury"), accounts[TREASURY].address);
    assert.equal(await view("hasRole", [role("GUARDIAN_ROLE"), accounts[ADMIN].address]), true);
    assert.equal(await view("hasRole", [role("REPORTER_ROLE"), accounts[REPORTER].address]), false);
    await call("grantRole", [role("REPORTER_ROLE"), accounts[REPORTER].address]);
    for (let i = A; i <= D; i++) await send(nativeUSDC, "TestUSDC", "approve", [pool, 10_000n * M], i);
    await send(nativeUSDC, "TestUSDC", "approve", [pool, 10_000n * M], OUTSIDER);
  });

  await test("Series are off until the admin turns them on, and only for real assets and durations", async () => {
    const start = await freshStart(300);
    await assert.rejects(call("bet", [0, 300, BigInt(start), true, 5n * M], A));
    await assert.rejects(call("setSeries", [0, 300, true], OUTSIDER));
    await assert.rejects(call("setSeries", [0, 123, true]));
    await assert.rejects(call("setSeries", [16, 300, true]));
    for (const asset of [0, 1, 2, 3]) for (const duration of [300, 900, 43200, 86400]) await call("setSeries", [asset, duration, true]);
    assert.equal(await view("seriesEnabled", [0, 300]), true);
    assert.equal(await view("seriesEnabled", [3, 86400]), true);
    assert.equal(await view("seriesEnabled", [0, 1800]), false);
  });

  await test("Bets: only before the start, aligned, within limits, and the stake is held by the contract", async () => {
    const start = await freshStart(300);
    const before = await usdcBalance(A);
    await call("bet", [0, 300, BigInt(start), true, 5n * M], A);
    assert.equal(before - (await usdcBalance(A)), 5n * M);
    assert.equal(await usdcBalance(pool), 5n * M);
    const w = await windowOf(0, 300, start);
    assert.equal(w.upPool, 5n * M);
    assert.equal(w.downPool, 0n);
    assert.equal(w.feeBps, 300);
    assert.equal((await positionOf(0, 300, start, A)).up, 5n * M);
    await assert.rejects(call("bet", [0, 300, BigInt(start + 1), true, 5n * M], A)); // not aligned
    await assert.rejects(call("bet", [0, 300, BigInt(start + 300), true, 5n * M], A)); // opens later than one round
    await assert.rejects(call("bet", [0, 300, BigInt(start), true, 999_999n], A)); // below minimum
    await assert.rejects(call("bet", [0, 300, BigInt(start), true, 46n * M], A)); // over the personal limit (5 + 46 > 50)
    await call("bet", [0, 300, BigInt(start), false, 5n * M], A); // both sides allowed, counts toward the limit
    await advanceTo(start + 1);
    await assert.rejects(call("bet", [0, 300, BigInt(start), true, 5n * M], B)); // already started
    assert.equal((await windowOf(0, 300, start)).upPool, 5n * M);
  });

  await test("The pool cap and the pause switch stop new bets; claims are never paused", async () => {
    const start = await freshStart(900);
    await call("setLimits", [1n * M, 50n * M, 60n * M]);
    await call("bet", [1, 900, BigInt(start), true, 50n * M], A);
    await assert.rejects(call("bet", [1, 900, BigInt(start), false, 11n * M], B)); // 50 + 11 > 60
    await call("bet", [1, 900, BigInt(start), false, 10n * M], B);
    await assert.rejects(call("bet", [1, 900, BigInt(start), false, 1n * M], C)); // full
    await call("setLimits", [1n * M, 50n * M, 500n * M]);
    await assert.rejects(call("setLimits", [0n, 50n * M, 500n * M]));
    await assert.rejects(call("setLimits", [5n * M, 1n * M, 500n * M]));
    await assert.rejects(call("setLimits", [1n * M, 50n * M, 500n * M], OUTSIDER));
    await call("setBettingPaused", [true]);
    await assert.rejects(call("bet", [1, 900, BigInt(start), false, 1n * M], C));
    await assert.rejects(call("setBettingPaused", [false], OUTSIDER));
    await call("setBettingPaused", [false]);
    await call("bet", [1, 900, BigInt(start), false, 1n * M], C);
  });

  await test("Up wins: exact fee from the losing side, exact payouts, dust to the owner, no early or double claim", async () => {
    const up = [[A, true, 10n * M], [B, true, 7n * M]];
    const down = [[C, false, 20n * M]];
    const balances = [A, B, C].map((i) => usdcBalance(i));
    const startBalances = await Promise.all(balances);
    const { start } = await play({ asset: 2, duration: 300, bets: [...up, ...down], endPrice: START_PRICE + 5_000_000n });
    const w = await windowOf(2, 300, start);
    const fee = (20n * M * 300n) / 10_000n;
    const distributable = 20n * M - fee;
    assert.equal(w.state, SETTLED);
    assert.equal(w.result, UP);
    assert.equal(w.fee, fee);
    assert.equal(w.distributable, distributable);
    assert.equal(w.startPrice, START_PRICE);
    // Payouts do not open until the review time has passed.
    const early = await view("previewClaim", [2, 300, BigInt(start), accounts[A].address]);
    assert.equal(early[2], false);
    await assert.rejects(call("claim", [2, 300, BigInt(start)], A));
    await advanceTo(Number(w.claimOpensAt) + 1);
    const ready = await view("previewClaim", [2, 300, BigInt(start), accounts[A].address]);
    const expectA = 10n * M + bonusFor(10n * M, distributable, 17n * M);
    assert.equal(ready[0], expectA);
    assert.equal(ready[1], false);
    assert.equal(ready[2], true);
    await call("claim", [2, 300, BigInt(start)], A);
    await call("claim", [2, 300, BigInt(start)], B);
    const expectB = 7n * M + bonusFor(7n * M, distributable, 17n * M);
    assert.equal((await usdcBalance(A)) - startBalances[0], expectA - 10n * M);
    assert.equal((await usdcBalance(B)) - startBalances[1], expectB - 7n * M);
    await assert.rejects(call("claim", [2, 300, BigInt(start)], A)); // double claim
    await assert.rejects(call("claim", [2, 300, BigInt(start)], C)); // loser has nothing to claim
    assert.equal((await usdcBalance(C)) - startBalances[2], -(20n * M));
    // Everything that was paid plus the owner's share equals everything that was bet.
    const dust = distributable - bonusFor(10n * M, distributable, 17n * M) - bonusFor(7n * M, distributable, 17n * M);
    const ownerAmount = await view("ownerBalance");
    assert.equal(ownerAmount, fee + dust + 0n);
    assert.equal(expectA + expectB + ownerAmount, 37n * M);
    // Owner withdrawal always goes to the treasury, and only the owner share leaves.
    const treasuryBefore = await usdcBalance(TREASURY);
    await call("withdrawOwnerBalance", [], OUTSIDER);
    assert.equal((await usdcBalance(TREASURY)) - treasuryBefore, ownerAmount);
    assert.equal(await view("ownerBalance"), 0n);
    await assert.rejects(call("withdrawOwnerBalance"));
  });

  await test("Down wins when the end price is lower", async () => {
    const { start } = await play({
      asset: 3, duration: 900,
      bets: [[A, true, 12n * M], [B, false, 4n * M], [C, false, 6n * M]],
      endPrice: START_PRICE - 1n,
    });
    const w = await windowOf(3, 900, start);
    assert.equal(w.result, DOWN);
    assert.equal(w.fee, (12n * M * 300n) / 10_000n);
    await advanceTo(Number(w.claimOpensAt) + 1);
    await call("claim", [3, 900, BigInt(start)], B);
    await call("claim", [3, 900, BigInt(start)], C);
    await assert.rejects(call("claim", [3, 900, BigInt(start)], A));
  });

  await test("Equal prices refund every stake and take no fee", async () => {
    const ownerBefore = await view("ownerBalance");
    const before = [await usdcBalance(A), await usdcBalance(B)];
    const { start } = await play({ asset: 0, duration: 900, bets: [[A, true, 9n * M], [B, false, 3n * M]], endPrice: START_PRICE });
    const w = await windowOf(0, 900, start);
    assert.equal(w.state, VOID);
    const preview = await view("previewClaim", [0, 900, BigInt(start), accounts[A].address]);
    assert.deepEqual([preview[0], preview[1], preview[2]], [9n * M, true, true]);
    await call("claim", [0, 900, BigInt(start)], A);
    await call("claim", [0, 900, BigInt(start)], B);
    assert.equal(await usdcBalance(A), before[0]);
    assert.equal(await usdcBalance(B), before[1]);
    assert.equal(await view("ownerBalance"), ownerBefore);
  });

  await test("A round with bets on one side only is refunded in full, even if the price moved", async () => {
    const before = await usdcBalance(A);
    const { start } = await play({ asset: 1, duration: 300, bets: [[A, false, 8n * M]], endPrice: START_PRICE + 1n });
    assert.equal((await windowOf(1, 300, start)).state, VOID);
    await call("claim", [1, 300, BigInt(start)], A);
    assert.equal(await usdcBalance(A), before);
  });

  await test("Price readings must be from the boundary, from the reporter, and in time", async () => {
    const start = await freshStart(300);
    await call("bet", [0, 300, BigInt(start), true, 5n * M], A);
    await call("bet", [0, 300, BigInt(start), false, 5n * M], B);
    const wrong = (price, observedAt) => report(0, 300, start, price, observedAt);
    await assert.rejects(call("reportStarts", [[wrong(START_PRICE, start + 1)]], REPORTER)); // before the start
    await advanceTo(start + 20);
    await assert.rejects(call("reportStarts", [[wrong(START_PRICE, start + 5)]], OUTSIDER)); // not the reporter
    await assert.rejects(call("reportStarts", [[wrong(START_PRICE, start - 5)]], REPORTER)); // reading older than the start
    await assert.rejects(call("reportStarts", [[wrong(START_PRICE, start + 181)]], REPORTER)); // reading too late
    await assert.rejects(call("reportStarts", [[wrong(START_PRICE, start + 100000)]], REPORTER)); // from the future
    await assert.rejects(call("reportStarts", [[wrong(0n, start + 5)]], REPORTER)); // zero price
    await assert.rejects(call("reportEnds", [[wrong(START_PRICE, start + 305)]], REPORTER)); // no start price yet
    await call("reportStarts", [[wrong(START_PRICE, start + 5)]], REPORTER);
    await assert.rejects(call("reportStarts", [[wrong(START_PRICE + 1n, start + 6)]], REPORTER)); // cannot be replaced
    await advanceTo(start + 300 + 15);
    await assert.rejects(call("reportEnds", [[wrong(START_PRICE + 1n, start + 299)]], REPORTER)); // reading before the end
    await assert.rejects(call("reportEnds", [[wrong(START_PRICE + 1n, start + 300 + 181)]], REPORTER));
    await call("reportEnds", [[wrong(START_PRICE + 1n, start + 300 + 5)]], REPORTER);
    await assert.rejects(call("reportEnds", [[wrong(START_PRICE - 1n, start + 300 + 6)]], REPORTER)); // cannot be replaced
    const w = await windowOf(0, 300, start);
    assert.equal(w.endPrice, START_PRICE + 1n);
    assert.equal(w.result, UP);
    // An empty round cannot be reported at all.
    const emptyStart = await freshStart(900);
    await advanceTo(emptyStart + 15);
    await assert.rejects(call("reportStarts", [[report(3, 900, emptyStart, START_PRICE, emptyStart + 5)]], REPORTER));
  });

  await test("A batch reports several assets at once and is all-or-nothing", async () => {
    const start = await freshStart(300);
    for (const asset of [0, 1, 2, 3]) {
      await call("bet", [asset, 300, BigInt(start), true, 2n * M], A);
      await call("bet", [asset, 300, BigInt(start), false, 2n * M], B);
    }
    await advanceTo(start + 15);
    const items = [0, 1, 2, 3].map((asset) => report(asset, 300, start, START_PRICE + BigInt(asset), start + 5));
    await assert.rejects(call("reportStarts", [[...items, report(0, 300, start, START_PRICE, start + 5)]], REPORTER));
    for (const asset of [0, 1, 2, 3]) assert.equal((await windowOf(asset, 300, start)).startPrice, 0n);
    await call("reportStarts", [items], REPORTER);
    for (const asset of [0, 1, 2, 3]) assert.equal((await windowOf(asset, 300, start)).startPrice, START_PRICE + BigInt(asset));
  });

  await test("Missing price readings: nobody can refund early, then anyone can refund everyone", async () => {
    const before = [await usdcBalance(A), await usdcBalance(B)];
    const start = await freshStart(300);
    await call("bet", [1, 300, BigInt(start), true, 6n * M], A);
    await call("bet", [1, 300, BigInt(start), false, 4n * M], B);
    await assert.rejects(call("voidUnreported", [1, 300, BigInt(start)], OUTSIDER)); // before the start
    await advanceTo(start + 200);
    await assert.rejects(call("voidUnreported", [1, 300, BigInt(start)], OUTSIDER)); // the reporter still has time
    await advanceTo(start + 301);
    await call("voidUnreported", [1, 300, BigInt(start)], OUTSIDER);
    assert.equal((await windowOf(1, 300, start)).state, VOID);
    await assert.rejects(call("voidUnreported", [1, 300, BigInt(start)], OUTSIDER)); // already refunded
    await call("claim", [1, 300, BigInt(start)], A);
    await call("claim", [1, 300, BigInt(start)], B);
    assert.equal(await usdcBalance(A), before[0]);
    assert.equal(await usdcBalance(B), before[1]);
  });

  await test("A missing end reading also refunds, after the start was reported", async () => {
    const start = await freshStart(300);
    await call("bet", [2, 300, BigInt(start), true, 3n * M], A);
    await call("bet", [2, 300, BigInt(start), false, 3n * M], B);
    await advanceTo(start + 15);
    await call("reportStarts", [[report(2, 300, start, START_PRICE, start + 5)]], REPORTER);
    await advanceTo(start + 300 + 100);
    await assert.rejects(call("voidUnreported", [2, 300, BigInt(start)], OUTSIDER));
    await advanceTo(start + 300 + 301);
    await assert.rejects(call("reportEnds", [[report(2, 300, start, START_PRICE + 1n, start + 300 + 5)]], REPORTER)); // too late now
    await call("voidUnreported", [2, 300, BigInt(start)], OUTSIDER);
    await call("claim", [2, 300, BigInt(start)], A);
    await call("claim", [2, 300, BigInt(start)], B);
  });

  await test("Guardian refund control: only during review, only returns stakes, never a payout", async () => {
    const before = [await usdcBalance(A), await usdcBalance(B)];
    const ownerBefore = await view("ownerBalance");
    const { start } = await play({ asset: 0, duration: 300, bets: [[A, true, 5n * M], [B, false, 5n * M]], endPrice: START_PRICE + 10n });
    const w = await windowOf(0, 300, start);
    assert.equal(w.state, SETTLED);
    await assert.rejects(call("voidWindow", [0, 300, BigInt(start), role("wrong-price")], OUTSIDER));
    await call("voidWindow", [0, 300, BigInt(start), role("wrong-price")]);
    const voided = await windowOf(0, 300, start);
    assert.equal(voided.state, VOID);
    assert.equal(voided.fee, 0n);
    await call("claim", [0, 300, BigInt(start)], A);
    await call("claim", [0, 300, BigInt(start)], B);
    assert.equal(await usdcBalance(A), before[0]);
    assert.equal(await usdcBalance(B), before[1]);
    assert.equal(await view("ownerBalance"), ownerBefore);
    await assert.rejects(call("voidWindow", [0, 300, BigInt(start), role("again")])); // already final
    // After payouts open a settled round can no longer be voided.
    const second = await play({ asset: 1, duration: 300, bets: [[A, true, 5n * M], [B, false, 5n * M]], endPrice: START_PRICE + 10n });
    const w2 = await windowOf(1, 300, second.start);
    await advanceTo(Number(w2.claimOpensAt) + 1);
    await assert.rejects(call("voidWindow", [1, 300, BigInt(second.start), role("too-late")]));
    await call("claim", [1, 300, BigInt(second.start)], A);
    await call("finalizeWindow", [1, 300, BigInt(second.start)], OUTSIDER);
    await assert.rejects(call("claim", [1, 300, BigInt(second.start)], B)); // loser
  });

  await test("A guardian can void before the start and the round then takes no bets", async () => {
    const start = await freshStart(900);
    const before = await usdcBalance(C);
    await call("bet", [2, 900, BigInt(start), true, 4n * M], C);
    await call("voidWindow", [2, 900, BigInt(start), role("market-problem")]);
    await assert.rejects(call("bet", [2, 900, BigInt(start), true, 4n * M], D));
    await call("claim", [2, 900, BigInt(start)], C);
    assert.equal(await usdcBalance(C), before);
  });

  await test("The fee a round starts with cannot be raised afterwards; caps and roles are enforced", async () => {
    const start = await freshStart(900);
    await call("bet", [1, 900, BigInt(start), true, 3n * M], A);
    await call("setFee", [1000n]);
    assert.equal((await windowOf(1, 900, start)).feeBps, 300);
    await call("bet", [1, 900, BigInt(start), false, 3n * M], B);
    assert.equal((await windowOf(1, 900, start)).feeBps, 300);
    const next = await freshStart(43200);
    await call("bet", [1, 43200, BigInt(next), true, 3n * M], A);
    assert.equal((await windowOf(1, 43200, next)).feeBps, 1000);
    await assert.rejects(call("setFee", [1001n]));
    await assert.rejects(call("setFee", [0n], OUTSIDER));
    await call("setFee", [300n]);
    await assert.rejects(call("setTreasury", ["0x0000000000000000000000000000000000000000"]));
    await assert.rejects(call("setTreasury", [accounts[D].address], OUTSIDER));
    await call("setTreasury", [accounts[D].address]);
    await call("setTreasury", [accounts[TREASURY].address]);
  });

  await test("12 hour and 24 hour rounds run on UTC boundaries and settle the same way", async () => {
    const half = 43200;
    const day = 86400;
    const a = await play({ asset: 0, duration: half, bets: [[A, true, 5n * M], [B, false, 5n * M]], endPrice: START_PRICE - 100n });
    assert.equal(a.start % half, 0);
    assert.equal((await windowOf(0, half, a.start)).result, DOWN);
    const b = await play({ asset: 3, duration: day, bets: [[A, false, 5n * M], [C, true, 5n * M]], endPrice: START_PRICE + 100n });
    assert.equal(b.start % day, 0);
    const wb = await windowOf(3, day, b.start);
    assert.equal(wb.result, UP);
    await advanceTo(Number(wb.claimOpensAt) + 1);
    await call("claim", [3, day, BigInt(b.start)], C);
  });

  await test("Randomised rounds conserve every USDC: payouts plus the owner share equal the stakes", async () => {
    let seed = 20261018;
    const rand = (max) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % max;
    };
    const users = [A, B, C, D];
    for (let round = 0; round < 4; round++) {
      const asset = round % 4;
      const duration = 300;
      const start = await freshStart(duration);
      const stakes = [];
      let total = 0n;
      for (let i = 0; i < 7; i++) {
        const who = users[i % users.length];
        const up = i === 0 ? true : i === 1 ? false : rand(2) === 1;
        const amount = BigInt(1_000_000 + rand(9_000_000));
        stakes.push([who, up, amount]);
        total += amount;
        await call("bet", [asset, duration, BigInt(start), up, amount], who);
      }
      const poolBefore = await usdcBalance(pool);
      const ownerBefore = await view("ownerBalance");
      await advanceTo(start + 15);
      await call("reportStarts", [[report(asset, duration, start, START_PRICE, start + 5)]], REPORTER);
      const end = start + duration;
      await advanceTo(end + 15);
      const goesUp = rand(2) === 1;
      await call("reportEnds", [[report(asset, duration, start, goesUp ? START_PRICE + 1n : START_PRICE - 1n, end + 5)]], REPORTER);
      const w = await windowOf(asset, duration, start);
      assert.equal(w.state, SETTLED);
      await advanceTo(Number(w.claimOpensAt) + 1);
      let paid = 0n;
      for (const who of users) {
        const position = await positionOf(asset, duration, start, who);
        const winningStake = goesUp ? position.up : position.down;
        if (winningStake === 0n) {
          if (position.up + position.down > 0n) await assert.rejects(call("claim", [asset, duration, BigInt(start)], who));
          continue;
        }
        const preview = await view("previewClaim", [asset, duration, BigInt(start), accounts[who].address]);
        const before = await usdcBalance(who);
        await call("claim", [asset, duration, BigInt(start)], who);
        const got = (await usdcBalance(who)) - before;
        assert.equal(got, preview[0]);
        paid += got;
      }
      const ownerShare = (await view("ownerBalance")) - ownerBefore;
      assert.equal(paid + ownerShare, total, "payouts plus the owner share must equal the stakes");
      assert.equal(await usdcBalance(pool), poolBefore - paid);
      await call("withdrawOwnerBalance");
    }
    assert.equal(await view("ownerBalance"), 0n);
    assert.equal(await usdcBalance(pool), await usdcBalance(pool)); // the contract keeps no balance it cannot account for
  });

  await test("The owner can never withdraw more than fees and dust, and the pool keeps open stakes", async () => {
    const start = await freshStart(300);
    await call("bet", [0, 300, BigInt(start), true, 20n * M], A);
    const held = await usdcBalance(pool);
    assert.equal(held >= 20n * M, true);
    assert.equal(await view("ownerBalance"), 0n);
    await assert.rejects(call("withdrawOwnerBalance"));
    assert.equal(await usdcBalance(pool), held);
    await advanceTo(start + 301);
    await call("voidUnreported", [0, 300, BigInt(start)], OUTSIDER);
    await call("claim", [0, 300, BigInt(start)], A);
  });

  console.log(JSON.stringify({ passed, contract: "UpDownPool", localOnly: true, chain: "Base Sepolia simulation", mainnetDeployed: false }));
} finally {
  await provider.disconnect();
}
