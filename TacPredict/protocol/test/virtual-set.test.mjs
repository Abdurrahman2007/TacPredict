import assert from "node:assert/strict";
import ganache from "ganache";
import { compile } from "../scripts/compile.mjs";
import { createPublicClient, createWalletClient, custom, defineChain, keccak256, stringToHex, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Isolated chain with Base Sepolia's id, so the "Base only" guards pass exactly as on Base.
const provider = ganache.provider({
  logging: { quiet: true },
  chain: { chainId: 84532, hardfork: "shanghai" },
  wallet: { totalAccounts: 5 },
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
const address = {};
const [admin, maker, taker, observer] = accounts;
const USDC = 1_000_000n;
let passed = 0;

async function deploy(name, args = [], keep = true) {
  const hash = await clients[0].deployContract({ abi: art[name].abi, bytecode: "0x" + art[name].evm.bytecode.object, args });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  if (keep) address[name] = receipt.contractAddress;
  return receipt.contractAddress;
}
async function write(name, fn, args = [], who = 0, at = address[name]) {
  const hash = await clients[who].writeContract({ address: at, abi: art[name].abi, functionName: fn, args });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  return receipt;
}
const read = (name, fn, args = [], at = address[name]) =>
  pub.readContract({ address: at, abi: art[name].abi, functionName: fn, args });
const advance = async (seconds) => {
  await provider.request({ method: "evm_increaseTime", params: [seconds] });
  await provider.request({ method: "evm_mine", params: [] });
};
const h = (text) => keccak256(stringToHex(text));
const balance = (who) => read("VirtualUSDC", "balanceOf", [who.address]);
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}

try {
  await deploy("TestUSDC");
  await deploy("VirtualUSDC", [admin.address, false, 10_000n * USDC]);

  await test("The virtual registry only accepts the virtual token, never other USDC-like tokens or non-contracts", async () => {
    await assert.rejects(deploy("VirtualMarketRegistry", [admin.address, address.TestUSDC], false));
    await assert.rejects(deploy("VirtualMarketRegistry", [admin.address, taker.address], false));
    await assert.rejects(deploy("VirtualMarketRegistry", [zeroAddress, address.VirtualUSDC], false));
  });

  await deploy("VirtualMarketRegistry", [admin.address, address.VirtualUSDC]);
  await deploy("VirtualResolutionOracle", [admin.address, address.VirtualMarketRegistry, 5n * USDC, 60n]);
  await deploy("VirtualMarketFactory", [admin.address, address.VirtualMarketRegistry, address.VirtualResolutionOracle]);
  await deploy("VirtualConditionalPositions", [address.VirtualMarketRegistry]);
  await deploy("VirtualExchange", [address.VirtualMarketRegistry, address.VirtualConditionalPositions]);
  await deploy("VirtualSettlement", [address.VirtualMarketRegistry, address.VirtualConditionalPositions]);
  await write("VirtualMarketRegistry", "grantRole", [h("FACTORY_ROLE"), address.VirtualMarketFactory]);
  await write("VirtualMarketRegistry", "grantRole", [h("ORACLE_ROLE"), address.VirtualResolutionOracle]);

  await test("Only the admin can build the protocol list, only for contracts, and it locks for good", async () => {
    await assert.rejects(write("VirtualUSDC", "allowProtocol", [address.VirtualExchange], 1));
    await assert.rejects(write("VirtualUSDC", "allowProtocol", [taker.address]));
    for (const name of ["VirtualConditionalPositions", "VirtualExchange", "VirtualResolutionOracle"])
      await write("VirtualUSDC", "allowProtocol", [address[name]]);
    await assert.rejects(write("VirtualUSDC", "lockProtocol", [], 1));
    await write("VirtualUSDC", "lockProtocol");
    await assert.rejects(write("VirtualUSDC", "allowProtocol", [address.VirtualSettlement]));
    assert.equal(await read("VirtualUSDC", "protocol", [address.VirtualSettlement]), false);
    assert.equal(await read("VirtualUSDC", "protocolLocked"), true);
  });

  await test("The admin funds wallets only inside the per-season budget, and cannot take or edit balances", async () => {
    assert.equal(await read("VirtualUSDC", "decimals"), 6);
    assert.equal(await read("VirtualUSDC", "symbol"), "vUSDC");
    const grant = (who, to, amount) => write("VirtualUSDC", "adminGrant", [to, amount, h("setup")], who);
    await assert.rejects(grant(1, maker.address, 500n * USDC));
    await assert.rejects(grant(0, zeroAddress, 500n * USDC));
    await assert.rejects(grant(0, maker.address, 0n));
    await assert.rejects(grant(0, maker.address, 10_001n * USDC));
    for (const i of [0, 1, 2, 3]) {
      await grant(0, accounts[i].address, 500n * USDC);
      assert.equal(await balance(accounts[i]), 500n * USDC);
    }
    assert.equal(await read("VirtualUSDC", "adminGrantedInSeason"), 2000n * USDC);
    assert.equal(await read("VirtualUSDC", "totalSupply"), 2000n * USDC);
    assert.equal(await read("VirtualUSDC", "totalGranted"), 2000n * USDC);
    await assert.rejects(grant(0, observer.address, 8_001n * USDC), undefined, "2000 + 8001 is over the 10000 budget");
    const names = art.VirtualUSDC.abi.map((x) => x.name);
    for (const forbidden of ["mint", "burn", "adminBurn", "adminTransfer", "setBalance"]) assert.ok(!names.includes(forbidden), forbidden);
  });

  await test("Virtual USDC cannot be sent to another wallet or pulled out by anyone but the trading contracts", async () => {
    await assert.rejects(write("VirtualUSDC", "transfer", [taker.address, USDC], 1));
    await write("VirtualUSDC", "approve", [taker.address, 10n * USDC], 1);
    await assert.rejects(write("VirtualUSDC", "transferFrom", [maker.address, taker.address, USDC], 2));
    await assert.rejects(write("VirtualUSDC", "transferFrom", [maker.address, admin.address, USDC], 0));
    assert.equal(await balance(maker), 500n * USDC);
    assert.equal(await balance(taker), 500n * USDC);
    await write("VirtualUSDC", "approve", [taker.address, 0n], 1);
  });

  for (const i of [0, 1, 2, 3]) {
    for (const name of ["VirtualConditionalPositions", "VirtualExchange", "VirtualResolutionOracle"])
      await write("VirtualUSDC", "approve", [address[name], 1_000n * USDC], i);
    await write("VirtualConditionalPositions", "setApprovalForAll", [address.VirtualExchange, true], i);
  }

  async function market(life = 150) {
    const id = await read("VirtualMarketRegistry", "nextMarketId");
    const now = (await pub.getBlock()).timestamp;
    const terms = {
      salt: h("salt" + id),
      metadataHash: h("metadata" + id),
      rulesHash: h("rules" + id),
      sourceHash: h("locked-source"),
      outcomes: 2,
      openAt: now + 3n,
      closeAt: now + BigInt(life),
      resolveAfter: now + BigInt(life),
      resolutionDeadline: now + BigInt(life + 250),
    };
    await write("VirtualMarketFactory", "createMarket", [terms, "https://tacpredict.fun/metadata/" + id]);
    await advance(4);
    return { id, terms };
  }
  const { id, terms } = await market();
  const yes = await read("VirtualConditionalPositions", "tokenId", [id, 0]);
  const types = {
    Order: [
      { name: "marketId", type: "uint256" },
      { name: "outcome", type: "uint8" },
      { name: "maker", type: "address" },
      { name: "isBuy", type: "bool" },
      { name: "price", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "expiration", type: "uint64" },
      { name: "taker", type: "address" },
    ],
  };
  const order = {
    marketId: id,
    outcome: 0,
    maker: maker.address,
    isBuy: false,
    price: 620_000n,
    shares: 40n * USDC,
    nonce: 0n,
    expiration: terms.closeAt,
    taker: zeroAddress,
  };
  const domain = (name) => ({ name, version: "1", chainId: 84532, verifyingContract: address.VirtualExchange });

  await test("Every position and fill moves virtual USDC through the contracts, signed under the virtual domain only", async () => {
    await write("VirtualConditionalPositions", "split", [id, 100n * USDC], 1);
    assert.equal(await balance(maker), 400n * USDC);
    assert.equal(await read("VirtualUSDC", "balanceOf", [address.VirtualConditionalPositions]), 100n * USDC);
    assert.equal(await read("VirtualConditionalPositions", "collateralLocked", [id]), 100n * USDC);

    // A signature made for the production exchange's domain is worthless here.
    const foreign = await maker.signTypedData({ domain: domain("TacPredictExchange"), types, primaryType: "Order", message: order });
    await assert.rejects(write("VirtualExchange", "fillOrder", [order, foreign, 20n * USDC], 2));

    const signature = await maker.signTypedData({ domain: domain("TacPredictVirtualExchange"), types, primaryType: "Order", message: order });
    await write("VirtualExchange", "fillOrder", [order, signature, 20n * USDC], 2);
    assert.equal(await read("VirtualConditionalPositions", "balanceOf", [taker.address, yes]), 20n * USDC);
    assert.equal(await balance(taker), 500n * USDC - 12_400_000n);
    assert.equal(await balance(maker), 400n * USDC + 12_400_000n);
    await assert.rejects(write("VirtualExchange", "fillOrder", [order, signature, 30n * USDC], 2));
  });

  await advance(160);
  await test("Resolution and claims pay out in virtual USDC and conserve every unit", async () => {
    const now = (await pub.getBlock()).timestamp;
    await write("VirtualResolutionOracle", "propose", [id, 0, false, h("evidence"), terms.sourceHash, now]);
    assert.equal(await balance(admin), 495n * USDC, "the proposer bond is virtual USDC too");
    await advance(61);
    await write("VirtualResolutionOracle", "finalize", [id], 3);
    assert.equal(await read("VirtualSettlement", "claimable", [id, taker.address]), 20n * USDC);
    assert.equal(await read("VirtualSettlement", "claimable", [id, maker.address]), 80n * USDC);
    await write("VirtualSettlement", "claim", [id], 2);
    await write("VirtualSettlement", "claim", [id], 1);
    await assert.rejects(write("VirtualSettlement", "claim", [id], 2));
    await write("VirtualResolutionOracle", "withdrawBondCredit");
    assert.equal(await balance(admin), 500n * USDC);
    assert.equal(await balance(taker), 500n * USDC - 12_400_000n + 20n * USDC);
    assert.equal(await balance(maker), 400n * USDC + 12_400_000n + 80n * USDC);
    assert.equal(await read("VirtualConditionalPositions", "collateralLocked", [id]), 0n);
    assert.equal(await read("VirtualUSDC", "balanceOf", [address.VirtualConditionalPositions]), 0n);
    assert.equal(await read("VirtualUSDC", "balanceOf", [address.VirtualResolutionOracle]), 0n);
    assert.equal(await read("VirtualUSDC", "totalSupply"), 2000n * USDC, "nothing was created or lost by trading");
  });

  const other = accounts[4];
  await test("The box gives a whole-dollar 50 to 500 USDC once per season", async () => {
    let seen = 0n;
    for (const i of [0, 1, 2, 3]) {
      const before = await balance(accounts[i]);
      await write("VirtualUSDC", "openBox", [], i);
      const amount = (await balance(accounts[i])) - before;
      assert.ok(amount >= 50n * USDC && amount <= 500n * USDC, "amount in range: " + amount);
      assert.equal(amount % USDC, 0n, "whole dollars");
      assert.equal(await read("VirtualUSDC", "boxSeason", [accounts[i].address]), 1n);
      await assert.rejects(write("VirtualUSDC", "openBox", [], i));
      seen += amount;
    }
    assert.equal(await read("VirtualUSDC", "totalBoxAmount"), seen);
    assert.equal(await read("VirtualUSDC", "boxesOpened"), 4n);
  });

  await test("Daily check-in pays 20, 30 \u2026 80 USDC over seven days, wraps, and a missed day restarts it", async () => {
    await assert.rejects(write("VirtualUSDC", "checkIn", [], 4), undefined, "needs the box first");
    await write("VirtualUSDC", "openBox", [], 4);
    const now = Number((await pub.getBlock()).timestamp);
    await advance(86400 - (now % 86400) + 10); // just after the next UTC midnight, so one day is one step
    const rewards = [20, 30, 40, 50, 60, 70, 80, 20, 30];
    for (const [n, usdc] of rewards.entries()) {
      if (n > 0) await advance(86400);
      const before = await balance(other);
      await write("VirtualUSDC", "checkIn", [], 4);
      assert.equal((await balance(other)) - before, BigInt(usdc) * USDC, "day " + (n + 1));
      if (n === 0) await assert.rejects(write("VirtualUSDC", "checkIn", [], 4), undefined, "once per UTC day");
    }
    assert.equal(await read("VirtualUSDC", "streak", [other.address]), 2n);
    await advance(2 * 86400);
    const before = await balance(other);
    await write("VirtualUSDC", "checkIn", [], 4);
    assert.equal((await balance(other)) - before, 20n * USDC);
    assert.equal(await read("VirtualUSDC", "streak", [other.address]), 1n);
    assert.ok((await read("VirtualUSDC", "totalCheckInAmount")) > 0n);
  });

  await test("Seasons: only the admin, not too soon; a new season resets the admin budget and allows a new box", async () => {
    await assert.rejects(write("VirtualUSDC", "startSeason", [], 1));
    await assert.rejects(write("VirtualUSDC", "startSeason"));
    await advance(20 * 24 * 3600 + 1);
    await assert.rejects(write("VirtualUSDC", "startSeason", [], 1));
    await write("VirtualUSDC", "startSeason");
    assert.equal(await read("VirtualUSDC", "season"), 2n);
    assert.equal(await read("VirtualUSDC", "adminGrantedInSeason"), 0n);
    const before = await balance(maker);
    await write("VirtualUSDC", "openBox", [], 1);
    assert.ok((await balance(maker)) - before >= 50n * USDC, "kept the old balance and added a new box");
    await assert.rejects(write("VirtualUSDC", "openBox", [], 1));
  });

  await test("With resetOnClaim a new season starts the wallet from its new box only", async () => {
    const reset = await deploy("VirtualUSDC", [admin.address, true, 0n], false);
    await write("VirtualUSDC", "openBox", [], 1, reset);
    await advance(20 * 24 * 3600 + 1);
    await write("VirtualUSDC", "startSeason", [], 0, reset);
    await write("VirtualUSDC", "openBox", [], 1, reset);
    const held = await read("VirtualUSDC", "balanceOf", [maker.address], reset);
    assert.ok(held >= 50n * USDC && held <= 500n * USDC);
    assert.equal(await read("VirtualUSDC", "totalSupply", [], reset), held);
    assert.ok((await read("VirtualUSDC", "totalGranted", [], reset)) >= held + 50n * USDC, "the first box was burned");
    await assert.rejects(write("VirtualUSDC", "adminGrant", [maker.address, USDC, h("none")], 0, reset), undefined, "zero budget disables grants");
  });

  console.log(`${passed} virtual set tests passed`);
} finally {
  await provider.disconnect();
}
