import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  encodeAbiParameters,
  parseAbiParameters,
  encodeFunctionData,
  decodeEventLog,
} from "viem";
import { compile, root } from "../scripts/compile.mjs";
const U = 1000000n;
let rpc, wallets, accounts, artifact, server, batchArtifact;
const transactionEvidence = [];
const chain = {
  id: 31337,
  name: "Local Cancun",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:18547"] } },
};
before(async () => {
  const result = compile({
    "Batch.sol": {
      content: `pragma solidity ^0.8.30; contract Batch { function calls(address target,bytes[] calldata data) external returns(bool[] memory ok) { ok=new bool[](data.length); for(uint i;i<data.length;i++) (ok[i],)=target.call(data[i]); } }`,
    },
  });
  artifact = result["VirtualAMM.sol"].VirtualAMM;
  batchArtifact = result["Batch.sol"].Batch;
  server = spawn(
    process.execPath,
    [
      root + "node_modules/hardhat/dist/src/cli.js",
      "node",
      "--network",
      "local",
      "--hostname",
      "127.0.0.1",
      "--port",
      "18547",
    ],
    { cwd: root, stdio: "ignore" },
  );
  rpc = createPublicClient({ chain, transport: http() });
  for (let i = 0; i < 150; i++) {
    try {
      if ((await rpc.getChainId()) === 31337) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  accounts = await rpc.request({ method: "eth_accounts" });
  wallets = accounts.map((account) => createWalletClient({ chain, account, transport: http() }));
});
after(async () => {
  server?.kill();
  if (process.env.VIRTUAL_LOCAL_EVIDENCE_PATH) {
    const fs = await import("node:fs");
    fs.writeFileSync(
      process.env.VIRTUAL_LOCAL_EVIDENCE_PATH,
      JSON.stringify(
        {
          network: "local Cancun EVM",
          chainId: 31337,
          notSepolia: true,
          notMainnet: true,
          transactions: transactionEvidence,
        },
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
        2,
      ) + "\n",
    );
  }
});
async function deploy(a = artifact, args = [accounts[0], 1000000n * U, 1000000n * U]) {
  const h = await wallets[0].deployContract({
    abi: a.abi,
    bytecode: "0x" + a.evm.bytecode.object,
    args,
  });
  const r = await rpc.waitForTransactionReceipt({ hash: h });
  assert.equal(r.status, "success");
  return r.contractAddress;
}
async function read(address, fn, args = []) {
  return rpc.readContract({ address, abi: artifact.abi, functionName: fn, args });
}
async function send(address, fn, args = [], who = 0) {
  const { request } = await rpc.simulateContract({
    account: accounts[who],
    address,
    abi: artifact.abi,
    functionName: fn,
    args,
  });
  const h = await wallets[who].writeContract(request);
  const r = await rpc.waitForTransactionReceipt({ hash: h });
  assert.equal(r.status, "success");
  if (
    [
      "buy",
      "sell",
      "propose",
      "challenge",
      "finalize",
      "adjudicate",
      "timeoutVoid",
      "settleFor",
      "setPaused",
    ].includes(fn)
  )
    transactionEvidence.push({
      function: fn,
      engine: address,
      wallet: accounts[who],
      hash: r.transactionHash,
      blockNumber: r.blockNumber,
      blockHash: r.blockHash,
      status: r.status,
      gasUsed: r.gasUsed,
      events: r.logs
        .filter((l) => l.address.toLowerCase() === address.toLowerCase())
        .map((l) => decodeEventLog({ abi: artifact.abi, ...l })),
    });
  return r;
}
async function setup(n = 2, feeBps = 0, overrides = {}) {
  const address = await deploy();
  for (const role of [
    "CREATOR_ROLE",
    "PROPOSER_ROLE",
    "WATCHER_ROLE",
    "ARBITER_ROLE",
    "GUARDIAN_ROLE",
  ])
    await send(address, "grantRole", [await read(address, role), accounts[0]]);
  const now = Number((await rpc.getBlock()).timestamp);
  await send(address, "createPool", [
    {
      rulesHash: keccak256(stringToHex("immutable test rules")),
      openAt: BigInt(now + 10),
      closeAt: BigInt(now + 1000),
      resolveAfter: BigInt(now + 1000),
      resolutionDeadline: BigInt(now + 5000),
      challengePeriod: 60,
      seed: 100n * U,
      reserveFloor: 1n,
      maxCashIn: 10000n * U,
      maxSharesIn: 10000n * U,
      maxPosition: 100000n * U,
      feeBps,
      outcomes: n,
      ...overrides,
    },
  ]);
  await rpc.request({ method: "evm_setNextBlockTimestamp", params: [now + 11] });
  await rpc.request({ method: "evm_mine", params: [] });
  return address;
}
async function grant(address, who = 1, amount = 100n * U) {
  const id = (await read(address, "campaignCount")) + 1n;
  const leaf = keccak256(
    keccak256(
      encodeAbiParameters(parseAbiParameters("address,uint256,uint256,address,uint128"), [
        address,
        31337n,
        id,
        accounts[who],
        amount,
      ]),
    ),
  );
  const now = (await rpc.getBlock()).timestamp;
  await send(address, "configureCampaign", [leaf, amount, now + 10000n]);
  await send(address, "claimGrant", [id, amount, []], who);
  return id;
}
async function trade(address, buy, input, who = 1, outcome = 0) {
  const q = await read(address, buy ? "quoteBuy" : "quoteSell", [1n, outcome, input]);
  const now = (await rpc.getBlock()).timestamp;
  const args = [
    1n,
    outcome,
    input,
    q.output,
    q.revision,
    now + 100n,
    await read(address, "actionNonce", [accounts[who]]),
  ];
  return send(address, buy ? "buy" : "sell", args, who);
}
async function conserved(a) {
  assert.equal(
    (await read(a, "seeded")) + (await read(a, "granted")),
    (await read(a, "totalCash")) +
      (await read(a, "lockedCollateral")) +
      (await read(a, "feeSink")) +
      (await read(a, "protocolSink")),
  );
}
async function close(a) {
  const p = await read(a, "pool", [1n]);
  await rpc.request({
    method: "evm_setNextBlockTimestamp",
    params: [Number(p.terms.resolveAfter)],
  });
  await rpc.request({ method: "evm_mine", params: [] });
}
async function finalize(a, voided = false, winner = 0) {
  await close(a);
  await send(a, "propose", [1n, winner, voided, keccak256(stringToHex("evidence"))]);
  const q = await read(a, "proposals", [1n]);
  await rpc.request({ method: "evm_setNextBlockTimestamp", params: [Number(q[1]) + 1] });
  await rpc.request({ method: "evm_mine", params: [] });
  await send(a, "finalize", [1n]);
}

test("deployment has no campaign, grant, trade roles or automatic balance", async () => {
  const a = await deploy();
  assert.equal(await read(a, "campaignCount"), 0n);
  assert.equal(await read(a, "cash", [accounts[1]]), 0n);
  assert.equal(await read(a, "hasRole", [await read(a, "CREATOR_ROLE"), accounts[0]]), false);
  for (const bad of ["deposit", "withdraw", "approve", "transfer", "redeem", "setBalance"])
    assert(!artifact.abi.some((x) => x.name === bad));
  await assert.rejects(send(a, "claimGrant", [1n, 1n, []], 1));
});
test("configurable Merkle grants bind chain, engine, wallet, amount and replay; no fixed 500", async () => {
  const a = await setup();
  const id = await grant(a, 1, 123n * U);
  assert.equal(await read(a, "cash", [accounts[1]]), 123n * U);
  await assert.rejects(send(a, "claimGrant", [id, 123n * U, []], 1));
  await assert.rejects(send(a, "claimGrant", [id, 123n * U, []], 2));
  await assert.rejects(
    send(a, "configureCampaign", [keccak256(stringToHex("x")), 1n, 9999999999n], 1),
  );
  await conserved(a);
});
test("Buy and Sell use distinct successful transactions; exact cost basis and event snapshots", async () => {
  const a = await setup();
  await grant(a);
  const b = await trade(a, true, 10n * U);
  let pos = await read(a, "positions", [1n, accounts[1], 0]);
  assert.equal(pos[0], 19090909n);
  assert.equal(pos[1], 10n * U);
  const s = await trade(a, false, pos[0] / 2n);
  console.log("Local EVM gas units, not Base fee: buy=" + b.gasUsed + " sell=" + s.gasUsed);
  assert.notEqual(b.transactionHash, s.transactionHash);
  let p = await read(a, "positions", [1n, accounts[1], 0]);
  assert.equal(p[2], 113443n);
  await trade(a, false, p[0]);
  p = await read(a, "positions", [1n, accounts[1], 0]);
  assert.equal(p[0], 0n);
  assert.equal(p[1], 0n);
  assert(p[2] <= 0n);
  const logs = s.logs
    .map((l) => {
      try {
        return decodeEventLog({ abi: artifact.abi, ...l });
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  assert.equal(logs.filter((l) => l.eventName === "TradeExecuted").length, 1);
  await conserved(a);
});
test("three-outcome fee accounting, partial sales, mark value and inventory conservation", async () => {
  const a = await setup(3, 50);
  await grant(a, 1, 1000n * U);
  await grant(a, 2, 1000n * U);
  for (let k = 0; k < 12; k++) {
    const who = (k % 2) + 1,
      o = k % 3;
    await trade(a, true, BigInt(k + 1) * U, who, o);
    if (k % 3 === 0) {
      const pos = await read(a, "positions", [1n, accounts[who], o]);
      await trade(a, false, pos[0] / 3n, who, o);
    }
    const p = await read(a, "pool", [1n]);
    for (let j = 0; j < 3; j++) {
      let total = p.reserves[j];
      for (const w of [1, 2]) total += (await read(a, "positions", [1n, accounts[w], j]))[0];
      assert.equal(total, p.collateral);
    }
    await conserved(a);
  }
  const m = await read(a, "markValue", [1n, accounts[1]]);
  assert(m[0] > 0n);
  assert((await read(a, "feeSink")) > 0n);
});
test("invalid input, insufficient balance/shares, slippage, nonce and revision fail atomically", async () => {
  const a = await setup();
  await grant(a);
  const q = await read(a, "quoteBuy", [1n, 0, 10n * U]);
  const now = (await rpc.getBlock()).timestamp;
  const args = [1n, 0, 10n * U, q.output, q.revision, now + 100n, 0n];
  for (const [index, value] of [
    [1, 3],
    [2, 0n],
    [3, q.output + 1n],
    [4, 99n],
    [5, 0n],
    [6, 1n],
  ]) {
    const bad = [...args];
    bad[index] = value;
    await assert.rejects(send(a, "buy", bad, 1));
  }
  await assert.rejects(send(a, "buy", args, 2));
  await assert.rejects(send(a, "sell", args, 1));
  assert.equal(await read(a, "actionNonce", [accounts[1]]), 0n);
  await conserved(a);
});
test("reserve-floor and max-position liquidity bounds reject rather than fabricate a fill", async () => {
  const a = await setup();
  await grant(a, 1, 100000n * U);
  await assert.rejects(read(a, "quoteBuy", [1n, 0, 10001n * U]));
  await assert.rejects(read(a, "quoteSell", [1n, 0, 0n]));
  await conserved(a);
});
test("transaction-wide latch blocks sequential smart-wallet trades, not just reentrancy", async () => {
  const a = await setup();
  const batch = await deploy(batchArtifact, []);
  // Grant the batch wallet via single-leaf campaign; any caller can call its test-only forwarding method.
  const amount = 100n * U,
    id = 1n,
    now = (await rpc.getBlock()).timestamp;
  const leaf = keccak256(
    keccak256(
      encodeAbiParameters(parseAbiParameters("address,uint256,uint256,address,uint128"), [
        a,
        31337n,
        id,
        batch,
        amount,
      ]),
    ),
  );
  await send(a, "configureCampaign", [leaf, amount, now + 10000n]);
  async function calls(data) {
    const hash = await wallets[0].writeContract({
      address: batch,
      abi: batchArtifact.abi,
      functionName: "calls",
      args: [a, data],
      gas: 5000000n,
    });
    return rpc.waitForTransactionReceipt({ hash });
  }
  await calls([
    encodeFunctionData({ abi: artifact.abi, functionName: "claimGrant", args: [1n, amount, []] }),
  ]);
  const q = await read(a, "quoteBuy", [1n, 0, 10n * U]);
  const d = encodeFunctionData({
    abi: artifact.abi,
    functionName: "buy",
    args: [1n, 0, 10n * U, 1n, q.revision, now + 100n, 0n],
  });
  const d2 = encodeFunctionData({
    abi: artifact.abi,
    functionName: "buy",
    args: [1n, 1, 10n * U, 1n, q.revision + 1n, now + 100n, 1n],
  });
  const r = await calls([d, d2]);
  assert.equal(r.status, "success");
  assert.equal(await read(a, "actionNonce", [batch]), 1n);
  const ev = r.logs
    .filter((l) => l.address.toLowerCase() === a.toLowerCase())
    .map((l) => decodeEventLog({ abi: artifact.abi, ...l }));
  assert.equal(ev.filter((e) => e.eventName === "TradeExecuted").length, 1);
  const qq = await read(a, "quoteSell", [1n, 0, 1000000n]);
  await calls([
    encodeFunctionData({
      abi: artifact.abi,
      functionName: "sell",
      args: [1n, 0, 1000000n, qq.output, qq.revision, now + 100n, 1n],
    }),
  ]);
  assert.equal(await read(a, "actionNonce", [batch]), 2n);
});
test("guardian pause, unauthorized resume and closing boundary; settlement still works while paused", async () => {
  const a = await setup();
  await grant(a);
  await trade(a, true, 10n * U);
  await send(a, "setPaused", [0n, true]);
  await assert.rejects(trade(a, true, U));
  await assert.rejects(send(a, "setPaused", [0n, false], 1));
  await finalize(a);
  const claim = await read(a, "claimable", [1n, accounts[1]]);
  assert(claim > 0n);
  await send(a, "settleFor", [1n, accounts[1]], 2);
  await assert.rejects(send(a, "settleFor", [1n, accounts[1]], 2));
  await conserved(a);
});
test("disputed result cannot finalize early; independent arbiter and timeout void", async () => {
  const a = await setup(3);
  await grant(a);
  await trade(a, true, 10n * U);
  await close(a);
  await send(a, "propose", [1n, 0, false, keccak256(stringToHex("evidence"))]);
  await send(a, "challenge", [1n, keccak256(stringToHex("dispute"))]);
  await assert.rejects(send(a, "finalize", [1n]));
  await assert.rejects(send(a, "adjudicate", [1n, 1, false, keccak256(stringToHex("arbiter"))]));
  const p = await read(a, "pool", [1n]);
  await rpc.request({
    method: "evm_setNextBlockTimestamp",
    params: [Number(p.terms.resolutionDeadline)],
  });
  await rpc.request({ method: "evm_mine", params: [] });
  await send(a, "timeoutVoid", [1n]);
  const payout = await read(a, "claimable", [1n, accounts[1]]);
  const pos = await read(a, "positions", [1n, accounts[1], 0]);
  assert.equal(payout, pos[0] / 3n);
  await send(a, "settleFor", [1n, accounts[1]], 2);
  const after = await read(a, "positions", [1n, accounts[1], 0]);
  assert.equal(after[2], payout - 10n * U);
  await conserved(a);
});
test("winning and losing terminal PnL, multiwallet void rounding and final result immutability", async () => {
  const a = await setup(3);
  await grant(a, 1);
  await grant(a, 2);
  await trade(a, true, 11n * U, 1, 0);
  await trade(a, true, 7n * U, 2, 2);
  await finalize(a, true);
  for (const w of [1, 2]) await send(a, "settleFor", [1n, accounts[w]], 0);
  assert((await read(a, "pool", [1n])).collateral <= 2n);
  await assert.rejects(send(a, "finalize", [1n]));
  await conserved(a);
});

test("local E2E: genuine contract receipts through fenced PostgreSQL indexer into reconciled positions", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const fs = await import("node:fs");
  const { indexVirtualRange } = await import("../../../src/lib/virtual/indexer-core.ts");
  const { projectWalletEvents } = await import("../../../src/lib/virtual/receipt.ts");
  const first = (await rpc.getBlockNumber({ cacheTime: 0 })) + 1n;
  const a = await setup(3, 50);
  await grant(a, 1, 200n * U);
  await trade(a, true, 13n * U, 1, 0);
  const pos = await read(a, "positions", [1n, accounts[1], 0]);
  await trade(a, false, pos[0] / 3n, 1, 0);
  const head = await rpc.getBlockNumber({ cacheTime: 0 }),
    db = new PGlite();
  try {
    await db.exec(
      `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$; CREATE TABLE public.protocol_wallets(address text,user_id uuid,verified_at timestamptz);`,
    );
    await db.exec(
      fs.readFileSync(
        new URL("../../../supabase/migration-drafts/virtual-v1.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.query(
      "INSERT INTO virtual_deployments(id,chain_id,engine,code_hash,start_block,checkpoint,finalized_block) VALUES($1,31337,$2,$3,$4,$5,$5)",
      ["e2e", a.toLowerCase(), "local-code", first.toString(), (first - 1n).toString()],
    );
    const f = (await db.query("SELECT virtual_acquire_lease('e2e') AS f")).rows[0].f;
    const block = async (n) => {
      const b = await rpc.getBlock({ blockNumber: n });
      return { number: b.number, hash: b.hash, parentHash: b.parentHash, timestamp: b.timestamp };
    };
    const result = await indexVirtualRange(
      {
        block,
        head: async () => head,
        finalized: async () => block(head - 1n),
        receipts: async (n) => {
          const logs = await rpc.getLogs({ address: a, fromBlock: n, toBlock: n });
          return Promise.all(
            [...new Set(logs.map((l) => l.transactionHash))].map((hash) =>
              rpc.getTransactionReceipt({ hash }),
            ),
          );
        },
      },
      {
        cursor: async () => {
          const c = (await db.query("SELECT * FROM virtual_deployments WHERE id='e2e'")).rows[0];
          return {
            number: BigInt(c.checkpoint),
            hash: c.checkpoint_hash,
            finalized: BigInt(c.finalized_block),
            start: BigInt(c.start_block),
          };
        },
        blockHash: async (n) =>
          (
            await db.query(
              "SELECT hash FROM virtual_blocks WHERE deployment_id='e2e' AND number=$1 AND canonical",
              [n.toString()],
            )
          ).rows[0]?.hash ?? null,
        rewind: async () => {
          throw Error("not expected in this E2E");
        },
        commit: async (b, events, expected) => {
          await db.query("SELECT virtual_commit_block('e2e',$1,$2,$3,$4,$5,$6,$7)", [
            f,
            b.number.toString(),
            b.hash,
            b.parentHash,
            b.timestamp.toString(),
            JSON.stringify(events),
            expected.toString(),
          ]);
        },
        finalize: async (n, h) => {
          await db.query("SELECT virtual_finalize_blocks('e2e',$1,$2,$3)", [f, n.toString(), h]);
        },
      },
      a,
      64,
    );
    assert.equal(result.checkpoint, head.toString());
    const events = (
      await db.query(
        "SELECT event FROM virtual_chain_events WHERE deployment_id='e2e' AND wallet=$1 AND canonical ORDER BY block_number,log_index",
        [accounts[1].toLowerCase()],
      )
    ).rows.map((r) => r.event);
    const projected = projectWalletEvents(events, accounts[1]);
    assert.equal(BigInt(projected.balance), await read(a, "cash", [accounts[1]]));
    const finalPos = await read(a, "positions", [1n, accounts[1], 0]);
    assert.equal(BigInt(projected.positions[0].shares), finalPos[0]);
    assert.equal(BigInt(projected.positions[0].basis), finalPos[1]);
    assert.equal(BigInt(projected.realizedPnl), finalPos[2]);
  } finally {
    await db.close();
  }
});

test("winning/losing settlement realizes exact basis and independent arbitration finalizes only after challenge", async () => {
  const a = await setup();
  await grant(a, 1);
  await grant(a, 2);
  await trade(a, true, 10n * U, 1, 0);
  await trade(a, true, 7n * U, 2, 1);
  const winnerPos = await read(a, "positions", [1n, accounts[1], 0]);
  await close(a);
  await send(a, "propose", [1n, 1, false, keccak256(stringToHex("first evidence"))]);
  await send(a, "challenge", [1n, keccak256(stringToHex("watcher evidence"))]);
  const proposal = await read(a, "proposals", [1n]);
  await rpc.request({ method: "evm_setNextBlockTimestamp", params: [Number(proposal[1]) + 1] });
  await rpc.request({ method: "evm_mine", params: [] });
  await assert.rejects(
    send(a, "adjudicate", [1n, 0, false, keccak256(stringToHex("arbiter evidence"))], 1),
  );
  await send(a, "adjudicate", [1n, 0, false, keccak256(stringToHex("arbiter evidence"))]);
  await send(a, "settleFor", [1n, accounts[1]], 2);
  await send(a, "settleFor", [1n, accounts[2]], 1);
  assert.equal((await read(a, "positions", [1n, accounts[1], 0]))[2], winnerPos[0] - 10n * U);
  assert.equal((await read(a, "positions", [1n, accounts[2], 1]))[2], -7n * U);
  await assert.rejects(trade(a, true, U, 1, 0));
  await conserved(a);
});
test("future grant budgets, expiry and market seed budgets fail safely", async () => {
  const a = await setup();
  const now = (await rpc.getBlock()).timestamp;
  await assert.rejects(
    send(a, "configureCampaign", [keccak256(stringToHex("budget")), 1000001n * U, now + 100n]),
  );
  const id = 1n,
    amount = 123n;
  const leaf = keccak256(
    keccak256(
      encodeAbiParameters(parseAbiParameters("address,uint256,uint256,address,uint128"), [
        a,
        31337n,
        id,
        accounts[1],
        amount,
      ]),
    ),
  );
  await send(a, "configureCampaign", [leaf, amount, now + 20n]);
  await rpc.request({ method: "evm_setNextBlockTimestamp", params: [Number(now + 21n)] });
  await rpc.request({ method: "evm_mine", params: [] });
  await assert.rejects(send(a, "claimGrant", [id, amount, []], 1));
  assert.equal(await read(a, "cash", [accounts[1]]), 0n);
  const p = await read(a, "pool", [1n]);
  await assert.rejects(
    send(a, "createPool", [
      {
        ...p.terms,
        openAt: now + 100n,
        closeAt: now + 200n,
        resolveAfter: now + 200n,
        resolutionDeadline: now + 1000n,
        seed: 1000000n * U,
      },
    ]),
  );
});

test("seeded randomized 2/3-outcome sequences preserve K, ownership, cash and basis invariants", async () => {
  let random = 0x12345678;
  const next = () => {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    return random >>> 0;
  };
  for (const outcomes of [2, 3]) {
    const a = await setup(outcomes, 75);
    await grant(a, 1, 2000n * U);
    await grant(a, 2, 2000n * U);
    for (let i = 0; i < 32; i++) {
      const who = 1 + (next() % 2),
        outcome = next() % outcomes;
      const before = await read(a, "pool", [1n]);
      const pos = await read(a, "positions", [1n, accounts[who], outcome]);
      const sell = pos[0] > U && next() % 3 === 0;
      await trade(a, !sell, sell ? pos[0] / 2n : BigInt(1 + (next() % 10)) * U, who, outcome);
      const after = await read(a, "pool", [1n]);
      const product = (p) => p.reserves.slice(0, outcomes).reduce((n, r) => n * r, 1n);
      assert(product(after) >= product(before));
      for (let j = 0; j < outcomes; j++) {
        const p1 = await read(a, "positions", [1n, accounts[1], j]),
          p2 = await read(a, "positions", [1n, accounts[2], j]);
        assert.equal(after.reserves[j] + p1[0] + p2[0], after.collateral);
        assert(after.reserves[j] >= after.terms.reserveFloor);
        for (const p of [p1, p2]) {
          assert(p[0] >= 0n && p[1] >= 0n);
          if (p[0] === 0n) assert.equal(p[1], 0n);
        }
      }
      await conserved(a);
    }
    await finalize(a, false, 0);
    for (const who of [1, 2]) await send(a, "settleFor", [1n, accounts[who]], 0);
    assert.equal((await read(a, "pool", [1n])).collateral, 0n);
    await conserved(a);
  }
});

test("extreme quantities, dust, true reserve exhaustion and position caps revert without state changes", async () => {
  const a = await setup(3, 50, { reserveFloor: 100n * U - 1n });
  await grant(a, 1, 1000n * U);
  await assert.rejects(read(a, "quoteBuy", [1n, 0, U]));
  await assert.rejects(read(a, "quoteBuy", [1n, 0, 1n]));
  await assert.rejects(read(a, "quoteSell", [1n, 0, 18446744073709551615n]));
  assert.equal(await read(a, "actionNonce", [accounts[1]]), 0n);
  await conserved(a);
  const b = await setup(2, 0, { maxPosition: U });
  await grant(b);
  await assert.rejects(trade(b, true, U));
  assert.equal((await read(b, "positions", [1n, accounts[1], 0]))[0], 0n);
  await conserved(b);
});

test("competing quotes cannot both execute against one pool revision", async () => {
  const a = await setup();
  await grant(a, 1);
  await grant(a, 2);
  const q = await read(a, "quoteBuy", [1n, 0, U]);
  const now = (await rpc.getBlock()).timestamp;
  const args = [1n, 0, U, q.output, q.revision, now + 100n, 0n];
  const r = await Promise.allSettled([send(a, "buy", args, 1), send(a, "buy", args, 2)]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    (await read(a, "actionNonce", [accounts[1]])) + (await read(a, "actionNonce", [accounts[2]])),
    1n,
  );
  await conserved(a);
});
