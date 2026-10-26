import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  toHex,
  encodeAbiParameters,
  parseAbiParameters,
  decodeEventLog,
} from "viem";
import { compile, root } from "../scripts/compile.mjs";
const U = 1000000n,
  chain = {
    id: 31337,
    name: "Local review",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1:18549"] } },
  };
let rpc, w, accounts, a, m, server;
const evidence = [];
before(async () => {
  const c = compile({
    "MockFeed.sol": {
      content: `pragma solidity ^0.8.30; contract MockFeed {struct R {int256 price;uint256 at;} mapping(uint80=>R) public rounds;uint80 public last;function decimals() external pure returns(uint8){return 8;}function push(int256 p,uint256 at) external {rounds[++last]=R(p,at);}function latestRoundData() external view returns(uint80,int256,uint256,uint256,uint80){R memory r=rounds[last];return(last,r.price,r.at,r.at,last);}function getRoundData(uint80 n) external view returns(uint80,int256,uint256,uint256,uint80){R memory r=rounds[n];return(n,r.price,r.at,r.at,n);}}`,
    },
  });
  a = c["VirtualPriceAMM.sol"].VirtualPriceAMM;
  m = c["MockFeed.sol"].MockFeed;
  assert(a.evm.deployedBytecode.object.length / 2 < 24576);
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
      "18549",
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
  w = accounts.map((account) => createWalletClient({ chain, account, transport: http() }));
});
after(() => {
  server?.kill();
  if (process.env.VIRTUAL_PRICE_EVIDENCE_PATH)
    fs.writeFileSync(
      process.env.VIRTUAL_PRICE_EVIDENCE_PATH,
      JSON.stringify(
        { network: "local Cancun only", chainId: 31337, transactions: evidence },
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
        2,
      ),
    );
});
async function deploy(art, args = []) {
  const hash = await w[0].deployContract({
    abi: art.abi,
    bytecode: "0x" + art.evm.bytecode.object,
    args,
  });
  const r = await rpc.waitForTransactionReceipt({ hash });
  assert.equal(r.status, "success");
  return r.contractAddress;
}
const read = (address, functionName, args = [], abi = a.abi) =>
  rpc.readContract({ address, abi, functionName, args });
async function send(address, functionName, args = [], who = 0, abi = a.abi) {
  const { request } = await rpc.simulateContract({
    address,
    abi,
    functionName,
    args,
    account: accounts[who],
  });
  const hash = await w[who].writeContract(request);
  const r = await rpc.waitForTransactionReceipt({ hash });
  assert.equal(r.status, "success");
  evidence.push({
    functionName,
    hash,
    status: r.status,
    block: r.blockNumber,
    gas: r.gasUsed,
    events: r.logs
      .filter((l) => l.address.toLowerCase() === address.toLowerCase())
      .flatMap((l) => {
        try {
          return [decodeEventLog({ abi, topics: l.topics, data: l.data })];
        } catch {
          return [];
        }
      }),
  });
  return r;
}
async function at(t) {
  await rpc.request({ method: "evm_setNextBlockTimestamp", params: [Number(t)] });
  await rpc.request({ method: "evm_mine", params: [] });
}
async function conservation(e) {
  const v = await Promise.all(
    ["totalCash", "lockedCollateral", "feeSink", "protocolSink", "seeded", "granted"].map((n) =>
      read(e, n),
    ),
  );
  assert.equal(v[0] + v[1] + v[2] + v[3], v[4] + v[5]);
}
async function setup(opts = {}) {
  const engine = await deploy(a, [accounts[0], 100000n * U, 1000n * U]),
    feed = await deploy(m),
    seq = await deploy(m);
  for (const role of [
    "CREATOR_ROLE",
    "GUARDIAN_ROLE",
    "PROPOSER_ROLE",
    "WATCHER_ROLE",
    "ARBITER_ROLE",
  ])
    await send(engine, "grantRole", [await read(engine, role), accounts[0]]);
  const now = (await rpc.getBlock()).timestamp;
  await send(seq, "push", [0n, now - 4001n], 0, m.abi);
  const open = now + 100n,
    close = open + 300n;
  const terms = {
    rulesHash: keccak256(stringToHex("frozen test rules")),
    openAt: open,
    closeAt: close,
    resolveAfter: close,
    resolutionDeadline: close + 300n,
    challengePeriod: 30,
    seed: 10000n * U,
    reserveFloor: 100n * U,
    maxCashIn: 100n * U,
    maxSharesIn: 500n * U,
    maxPosition: 1000n * U,
    feeBps: 0,
    outcomes: 2,
    ...opts.terms,
  };
  await send(engine, "createPool", [terms]);
  const policy = {
    feed,
    sequencer: seq,
    asset: toHex("BTC", { size: 32 }),
    maxAge: 30,
    boundaryTolerance: 30,
    sigmaPpm: 1000,
    spreadPpm: 10000,
    impactPpm: 10000,
    skewPpm: 1000,
    minProbabilityPpm: 10000,
    minSpot: 1n,
    maxSpot: 10000000n * 100000000n,
    tieVoids: true,
    ...opts.policy,
  };
  await send(engine, "configurePricePolicy", [1n, policy]);
  const leaf = keccak256(
    keccak256(
      encodeAbiParameters(parseAbiParameters("address,uint256,uint256,address,uint128"), [
        engine,
        31337n,
        1n,
        accounts[1],
        100n * U,
      ]),
    ),
  );
  await send(engine, "configureMonthlyCampaign", [
    keccak256(stringToHex("2027-01")),
    leaf,
    100n * U,
    now + 20n,
    close + 1000n,
    100n * U,
    keccak256(stringToHex("test-eligibility")),
  ]);
  await send(feed, "push", [10000000000000n, open - 1n], 0, m.abi);
  await at(open);
  await send(feed, "push", [10000000000000n, open], 0, m.abi);
  await send(engine, "captureStart", [1n, 2n]);
  await send(engine, "claimGrant", [1n, 100n * U, []], 1);
  return { engine, feed, seq, terms, policy, open, close };
}
async function trade(e, buy, input, who = 1) {
  const q = await read(e, buy ? "quoteBuy" : "quoteSell", [1n, 0, input]);
  const nonce = await read(e, "actionNonce", [accounts[who]]),
    now = (await rpc.getBlock()).timestamp;
  return send(e, buy ? "buy" : "sell", [1n, 0, input, q.output, q.revision, now + 20n, nonce], who);
}
test("no automatic grants or real asset methods; fits EIP170", async () => {
  const e = await deploy(a, [accounts[0], 1000n * U, 1000n * U]);
  assert.equal(await read(e, "granted"), 0n);
  assert.equal(await read(e, "campaignCount"), 0n);
  for (const n of ["deposit", "withdraw", "approve", "transfer", "redeem", "setBalance"])
    assert(!a.abi.some((x) => x.type === "function" && x.name === n));
});
test("distinct Buy/Sell receipts, partial basis, repeated trades and conservation", async () => {
  const { engine: e } = await setup();
  const b = await trade(e, true, U);
  let p = await read(e, "positions", [1n, accounts[1], 0]);
  const s = await trade(e, false, p[0] / 2n);
  assert.notEqual(b.transactionHash, s.transactionHash);
  p = await read(e, "positions", [1n, accounts[1], 0]);
  assert(p[1] > 0n && p[1] < U);
  await trade(e, false, p[0]);
  p = await read(e, "positions", [1n, accounts[1], 0]);
  assert.equal(p[0], 0n);
  assert.equal(p[1], 0n);
  assert(p[2] < 0n);
  assert.equal(await read(e, "actionNonce", [accounts[1]]), 3n);
  await conservation(e);
});
test("feed price and remaining time change probability without TacPredict repricing writes", async () => {
  const { engine: e, feed, close } = await setup();
  const base = await read(e, "probability", [1n]);
  let now = (await rpc.getBlock()).timestamp;
  await send(feed, "push", [10010000000000n, now], 0, m.abi);
  assert((await read(e, "probability", [1n])) > base);
  const p = await read(e, "probability", [1n]);
  await at(close - 10n);
  await send(feed, "push", [10010000000000n, close - 10n], 0, m.abi);
  assert((await read(e, "probability", [1n])) > p);
});
test("insufficient balance/shares, slippage, replay, unauthorized calls and pause", async () => {
  const { engine: e } = await setup();
  await assert.rejects(() => trade(e, true, 101n * U));
  await assert.rejects(() => trade(e, false, U));
  await assert.rejects(() => send(e, "setPaused", [0n, true], 1));
  const q = await read(e, "quoteBuy", [1n, 0, U]),
    now = (await rpc.getBlock()).timestamp;
  await assert.rejects(() =>
    send(e, "buy", [1n, 0, U, q.output + 1n, q.revision, now + 20n, 0n], 1),
  );
  await trade(e, true, U);
  await assert.rejects(() => send(e, "buy", [1n, 0, U, q.output, q.revision, now + 20n, 0n], 1));
  await send(e, "setPaused", [0n, true]);
  await assert.rejects(() => trade(e, true, U));
  await send(e, "setPaused", [0n, false]);
  await conservation(e);
});
test("stale/negative/future feed and sequencer down/recovery fail closed", async () => {
  const { engine: e, feed, seq } = await setup();
  let now = (await rpc.getBlock()).timestamp;
  await at(now + 31n);
  await assert.rejects(() => read(e, "quoteBuy", [1n, 0, U]));
  now = (await rpc.getBlock()).timestamp;
  for (const [value, time] of [
    [-1n, now],
    [10000000000000n, now + 100n],
  ]) {
    await send(feed, "push", [value, time], 0, m.abi);
    await assert.rejects(() => read(e, "probability", [1n]));
  }
  await send(feed, "push", [10000000000000n, now], 0, m.abi);
  for (const value of [1n, 0n]) {
    await send(seq, "push", [value, now], 0, m.abi);
    await assert.rejects(() => read(e, "probability", [1n]));
  }
});
test("immutable policies and five supported asset identifiers", async () => {
  const { engine: e, policy } = await setup();
  await assert.rejects(() => send(e, "configurePricePolicy", [1n, policy]));
  for (const asset of ["BTC", "ETH", "SOL", "XRP", "BNB"]) {
    const now = (await rpc.getBlock()).timestamp,
      t = {
        ...(await read(e, "pool", [1n])).terms,
        openAt: now + 100n,
        closeAt: now + 400n,
        resolveAfter: now + 400n,
        resolutionDeadline: now + 800n,
      };
    await send(e, "createPool", [t]);
    await send(e, "configurePricePolicy", [
      await read(e, "poolCount"),
      { ...policy, asset: toHex(asset, { size: 32 }) },
    ]);
  }
  await conservation(e);
});
test("first closing round, challenge wait, winning settlement and duplicate prevention", async () => {
  const { engine: e, feed, close } = await setup();
  await trade(e, true, U);
  await at(close - 2n);
  await send(feed, "push", [10000000000000n, close - 1n], 0, m.abi);
  await at(close + 1n);
  await send(feed, "push", [10010000000000n, close], 0, m.abi);
  await assert.rejects(() => trade(e, true, U));
  await assert.rejects(() => send(e, "propose", [1n, 0, false, keccak256(stringToHex("fake"))]));
  await send(e, "proposeFromFeed", [1n, 4n, keccak256(stringToHex("round4"))]);
  await assert.rejects(() => send(e, "finalize", [1n]));
  const p = await read(e, "proposals", [1n]);
  await at(p[1]);
  await send(e, "finalize", [1n]);
  await send(e, "settleFor", [1n, accounts[1]]);
  assert((await read(e, "positions", [1n, accounts[1], 0]))[2] > 0n);
  await assert.rejects(() => send(e, "settleFor", [1n, accounts[1]]));
  await conservation(e);
});
test("late boundary is rejected; missing result timeout-void is permissionless", async () => {
  const { engine: e, feed, close, terms } = await setup();
  await trade(e, true, U);
  await at(close + 31n);
  await send(feed, "push", [11000000000000n, close + 31n], 0, m.abi);
  await assert.rejects(() => send(e, "proposeFromFeed", [1n, 3n, keccak256(stringToHex("late"))]));
  await at(terms.resolutionDeadline);
  await send(e, "timeoutVoid", [1n], 2);
  await send(e, "settleFor", [1n, accounts[1]], 2);
  await conservation(e);
});
test("campaign duplicate claims, authorization, cancellation and reserved budget", async () => {
  const { engine: e } = await setup();
  await assert.rejects(() => send(e, "claimGrant", [1n, 100n * U, []], 1));
  await assert.rejects(() => send(e, "setCampaignState", [1n, true, false], 1));
  await send(e, "setCampaignState", [1n, true, false]);
  await send(e, "setCampaignState", [1n, false, true]);
  assert.equal(await read(e, "campaignBudgetReserved"), 100n * U);
  await assert.rejects(() => send(e, "setCampaignState", [1n, false, false]));
  await conservation(e);
});
test("finite reserves reject excessive liability", async () => {
  const { engine: e } = await setup({ terms: { reserveFloor: 9999n * U } });
  await assert.rejects(() => read(e, "quoteBuy", [1n, 0, 100n * U]));
  await conservation(e);
});
test("scheduled campaigns reject early/paused claims, release only unused cap and cannot repeat month", async () => {
  const e = await deploy(a, [accounts[0], 1000n * U, 1000n * U]),
    now = (await rpc.getBlock()).timestamp;
  const leaf = keccak256(
      keccak256(
        encodeAbiParameters(parseAbiParameters("address,uint256,uint256,address,uint128"), [
          e,
          31337n,
          1n,
          accounts[1],
          100n * U,
        ]),
      ),
    ),
    month = keccak256(stringToHex("2027-02")),
    elig = keccak256(stringToHex("reviewed"));
  await send(e, "configureMonthlyCampaign", [
    month,
    leaf,
    200n * U,
    now + 20n,
    now + 200n,
    100n * U,
    elig,
  ]);
  await assert.rejects(() => send(e, "claimGrant", [1n, 100n * U, []], 1));
  await send(e, "setCampaignState", [1n, true, false]);
  await at(now + 21n);
  await assert.rejects(() => send(e, "claimGrant", [1n, 100n * U, []], 1));
  await send(e, "setCampaignState", [1n, false, false]);
  await send(e, "claimGrant", [1n, 100n * U, []], 1);
  await send(e, "setCampaignState", [1n, false, true]);
  assert.equal(await read(e, "campaignBudgetReserved"), 100n * U);
  assert.equal(await read(e, "granted"), 100n * U);
  await assert.rejects(() =>
    send(e, "configureMonthlyCampaign", [
      month,
      leaf,
      100n * U,
      now + 50n,
      now + 200n,
      100n * U,
      elig,
    ]),
  );
  await conservation(e);
});

test("new-engine receipts flow through fenced SQL indexer and duplicate-safe wallet projection", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { indexVirtualRange } = await import("../../../src/lib/virtual/indexer-core.ts");
  const { projectWalletEvents, verifyTradeReceipt } =
    await import("../../../src/lib/virtual/receipt.ts");
  const { engine: e } = await setup();
  const buy = await trade(e, true, U);
  const p = await read(e, "positions", [1n, accounts[1], 0]);
  const sell = await trade(e, false, p[0]);
  const canonical = await rpc.getBlock({ blockNumber: sell.blockNumber });
  assert.equal(
    verifyTradeReceipt(
      sell,
      e,
      {
        wallet: accounts[1],
        marketId: "1",
        outcome: 0,
        isBuy: false,
        input: p[0].toString(),
        nonce: "1",
      },
      canonical.hash,
      -1n,
    ).status,
    "confirmed",
  );
  const logs = await rpc.getLogs({ address: e, fromBlock: 0n, toBlock: "latest" });
  const start = logs[0].blockNumber,
    head = await rpc.getBlockNumber({ cacheTime: 0 });
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT null::uuid$$;CREATE TABLE protocol_wallets(address text,user_id uuid,verified_at timestamptz);",
    );
    await db.exec(
      fs.readFileSync(
        new URL("../../../supabase/migration-drafts/virtual-v1.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.query(
      "INSERT INTO virtual_deployments(id,chain_id,engine,code_hash,start_block,checkpoint,finalized_block) VALUES('price',31337,$1,'local',$2,$3,$3)",
      [e.toLowerCase(), start.toString(), (start - 1n).toString()],
    );
    const fence = (await db.query("SELECT virtual_acquire_lease('price') f")).rows[0].f;
    const block = async (n) => {
      const b = await rpc.getBlock({ blockNumber: n });
      return { number: b.number, hash: b.hash, parentHash: b.parentHash, timestamp: b.timestamp };
    };
    await indexVirtualRange(
      {
        block,
        head: async () => head,
        finalized: () => block(start - 1n),
        receipts: async (n) => {
          const ls = await rpc.getLogs({ address: e, fromBlock: n, toBlock: n });
          return Promise.all(
            [...new Set(ls.map((l) => l.transactionHash))].map((hash) =>
              rpc.getTransactionReceipt({ hash }),
            ),
          );
        },
      },
      {
        cursor: async () => {
          const r = (await db.query("SELECT * FROM virtual_deployments WHERE id='price'")).rows[0];
          return {
            start: BigInt(r.start_block),
            number: BigInt(r.checkpoint),
            hash: r.checkpoint_hash,
            finalized: BigInt(r.finalized_block),
          };
        },
        blockHash: async (n) =>
          (
            await db.query(
              "SELECT hash FROM virtual_blocks WHERE deployment_id='price' AND number=$1 AND canonical",
              [n.toString()],
            )
          ).rows[0]?.hash ?? null,
        rewind: async () => {
          throw Error("Unexpected reorg in local E2E");
        },
        commit: async (b, events, expected) => {
          await db.query("SELECT virtual_commit_block('price',$1,$2,$3,$4,$5,$6,$7)", [
            fence,
            b.number.toString(),
            b.hash,
            b.parentHash,
            b.timestamp.toString(),
            JSON.stringify(events),
            expected.toString(),
          ]);
        },
        finalize: async () => {},
      },
      e,
      64,
    );
    const es = (
      await db.query(
        "SELECT event FROM virtual_chain_events WHERE deployment_id='price' AND wallet=$1 AND canonical ORDER BY block_number,log_index",
        [accounts[1].toLowerCase()],
      )
    ).rows.map((r) => r.event);
    const projection = projectWalletEvents(es, accounts[1]);
    assert.equal(projection.balance, (await read(e, "cash", [accounts[1]])).toString());
    assert.equal(
      projection.realizedPnl,
      (await read(e, "positions", [1n, accounts[1], 0]))[2].toString(),
    );
    assert.equal(projection.trades.length, 2);
    assert.notEqual(buy.transactionHash, sell.transactionHash);
    assert.deepEqual(projectWalletEvents([...es, ...es], accounts[1]), projection);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM virtual_chain_events WHERE event->>'name'='PricePolicyFrozen'",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
