import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encodeAbiParameters, encodeEventTopics, keccak256, parseAbi, zeroAddress } from "viem";
import { applyProjectedEvent, MARKET_BOUND_EVENTS } from "../scripts/indexer-projection-guard.mjs";
import { runFinalizedIndexer } from "../scripts/indexer-core.mjs";
const uuid = "11111111-1111-4111-8111-111111111111";
const row = { id: uuid, chain_id: 84532, onchain_id: "1" };
const args = (event, payload = { marketId: "1" }) => ({
  _chain: 84532,
  _event: event,
  _payload: payload,
});

test("every market-bound event rejects missing market BEFORE applying, including replay candidates", async () => {
  for (const event of MARKET_BOUND_EVENTS) {
    const calls = [];
    await assert.rejects(
      applyProjectedEvent(async (r) => {
        calls.push(r);
        return [];
      }, args(event)),
      /market projection/,
    );
    assert.deepEqual(calls, ["protocol_markets"]);
  }
});
test("ambiguous, wrong-chain, wrong-ID and lossy-number market projections fail closed", async () => {
  for (const rows of [
    [row, row],
    [{ ...row, chain_id: 8453 }],
    [{ ...row, onchain_id: "2" }],
    [{ ...row, onchain_id: 1 }],
    null,
  ]) {
    let applied = false;
    await assert.rejects(
      applyProjectedEvent(async (r) => {
        if (r.startsWith("rpc/")) applied = true;
        return rows;
      }, args("TradeExecuted")),
    );
    assert.equal(applied, false);
  }
});
test("valid market and duplicate boolean acknowledgements preserve idempotence, unknown acknowledgement rejects", async () => {
  for (const ack of [true, false])
    assert.equal(
      await applyProjectedEvent(
        async (r) => (r === "protocol_markets" ? [row] : ack),
        args("TradeExecuted"),
      ),
      ack,
    );
  for (const ack of [null, undefined, "true", 1, {}, []])
    await assert.rejects(
      applyProjectedEvent(
        async (r) => (r === "protocol_markets" ? [row] : ack),
        args("TradeExecuted"),
      ),
      /acknowledgement/,
    );
});
test("market creation is checked AFTER apply and duplicate-false cannot conceal a missing created market", async () => {
  for (const ack of [true, false]) {
    const calls = [];
    await assert.rejects(
      applyProjectedEvent(async (r) => {
        calls.push(r);
        return r === "protocol_markets" ? [] : ack;
      }, args("MarketCreated")),
      /market projection/,
    );
    assert.deepEqual(calls, ["rpc/apply_leased_protocol_event", "protocol_markets"]);
    assert.equal(
      await applyProjectedEvent(
        async (r) => (r === "protocol_markets" ? [row] : ack),
        args("MarketCreated"),
      ),
      ack,
    );
  }
});
test("market IDs above Number precision are queried exactly and numeric/malformed event IDs reject", async () => {
  const id = "90071992547409931234567";
  let query;
  await applyProjectedEvent(
    async (r, b, q) => {
      if (r === "protocol_markets") {
        query = q;
        return [{ ...row, onchain_id: id }];
      }
      return true;
    },
    args("PositionRedeemed", { marketId: id }),
  );
  assert(query.endsWith("onchain_id=eq." + id));
  for (const id of [1, "0", "01", "1e3", (1n << 256n).toString(), undefined])
    await assert.rejects(
      applyProjectedEvent(
        async () => {
          throw Error("Should not query");
        },
        args("PositionRedeemed", { marketId: id }),
      ),
    );
});
test("global cancellation/nonce/bond events do not invent market ID or require a stored order", async () => {
  for (const event of ["OrderCancelled", "NonceInvalidated", "BondWithdrawn"]) {
    const calls = [];
    assert.equal(
      await applyProjectedEvent(
        async (r) => {
          calls.push(r);
          return true;
        },
        args(event, {}),
      ),
      true,
    );
    assert.deepEqual(calls, ["rpc/apply_leased_protocol_event"]);
  }
  await assert.rejects(
    applyProjectedEvent(async () => true, args("UnknownFinancialEvent")),
    /Unsupported/,
  );
});
const transfer = { from: "0x" + "1".repeat(40), to: "0x" + "2".repeat(40), id: "7", value: "1" };
const outcome = { market_uuid: uuid, token_id: "7", protocol_markets: row };
test("ERC1155 missing tokens/parent or wrong-chain projection stop before event application", async () => {
  for (const rows of [
    [],
    [outcome, outcome],
    [{ ...outcome, token_id: "8" }],
    [{ ...outcome, protocol_markets: { ...row, chain_id: 8453 } }],
    [{ ...outcome, market_uuid: "other" }],
  ]) {
    let applied = false;
    await assert.rejects(
      applyProjectedEvent(
        async (r) => {
          if (r.startsWith("rpc/")) applied = true;
          return rows;
        },
        args("TransferSingle", transfer),
      ),
    );
    assert.equal(applied, false);
  }
});
test("valid tokens, batch deduplication and legitimate self-transfer no-op preserve existing behavior", async () => {
  const calls = [];
  const db = async (r) => {
    calls.push(r);
    return r === "protocol_market_outcomes" ? [outcome] : true;
  };
  assert.equal(
    await applyProjectedEvent(
      db,
      args("TransferBatch", { ...transfer, ids: ["7", "7"], values: ["1", "2"] }),
    ),
    true,
  );
  assert.deepEqual(calls, ["protocol_market_outcomes", "rpc/apply_leased_protocol_event"]);
  calls.length = 0;
  assert.equal(
    await applyProjectedEvent(
      db,
      args("TransferSingle", { ...transfer, to: transfer.from, id: "999999" }),
    ),
    true,
  );
  assert.deepEqual(calls, ["rpc/apply_leased_protocol_event"]);
  await assert.rejects(
    applyProjectedEvent(db, args("TransferBatch", { ...transfer, ids: ["7"], values: [] })),
    /arrays/,
  );
  await assert.rejects(
    applyProjectedEvent(db, args("TransferSingle", { ...transfer, id: 7 })),
    /canonical/,
  );
});

// Exercise the ACTUAL indexer orchestration through a total fetch mock. Never contact live RPC/DB.
const address = (n) => "0x" + n.toString(16).padStart(40, "0");
const hash = (n) => "0x" + n.toString(16).padStart(64, "0");
const abi = parseAbi([
  "event TradeExecuted(bytes32 indexed buyOrderId, bytes32 indexed sellOrderId, uint256 indexed marketId, address buyer, address seller, uint8 outcome, uint256 price, uint256 shares, uint256 usdcAmount)",
]);
async function runMock(mode) {
  const code = "0x6000",
    keys = ["registry", "factory", "positions", "exchange", "oracle", "settlement"];
  const d = {
    chain_id: 84532,
    deployment_block: "1",
    collateral_token: address(9),
    code_hashes: {},
  };
  for (let i = 0; i < keys.length; i++) {
    d[keys[i]] = address(i + 1);
    d.code_hashes[keys[i]] = keccak256(code);
  }
  const eventLog = {
    address: d.exchange,
    blockHash: hash(1),
    blockNumber: "0x1",
    transactionHash: hash(2),
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
    topics: encodeEventTopics({
      abi,
      eventName: "TradeExecuted",
      args: { buyOrderId: hash(3), sellOrderId: hash(4), marketId: 1n },
    }),
    data: encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint8" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [address(10), address(11), 0, 500000n, 2000000n, 1000000n],
    ),
  };
  const block = {
    number: "0x1",
    hash: hash(1),
    parentHash: hash(0),
    logsBloom: "0x" + "0".repeat(512),
    miner: zeroAddress,
    gasLimit: "0x100000",
    gasUsed: "0x1000",
    timestamp: "0x100",
    transactions: [],
    nonce: "0x0000000000000000",
    sha3Uncles: hash(0),
    difficulty: "0x0",
    totalDifficulty: "0x0",
    size: "0x1",
    extraData: "0x",
    transactionsRoot: hash(0),
    stateRoot: hash(0),
    receiptsRoot: hash(0),
    baseFeePerGas: "0x1",
    uncles: [],
  };
  const receipt = {
    transactionHash: hash(2),
    transactionIndex: "0x0",
    blockHash: hash(1),
    blockNumber: "0x1",
    from: address(10),
    to: d.exchange,
    cumulativeGasUsed: "0x1000",
    gasUsed: "0x1000",
    effectiveGasPrice: "0x1",
    contractAddress: null,
    logs: [eventLog],
    logsBloom: block.logsBloom,
    status: "0x1",
    type: "0x2",
  };
  const calls = [],
    oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init),
      url = new URL(req.url),
      body = req.method === "POST" ? JSON.parse(await req.text()) : null;
    if (url.hostname === "rpc.invalid") {
      const rpc = (r) => {
        let result;
        switch (r.method) {
          case "eth_chainId":
            result = "0x14a34";
            break;
          case "eth_getCode":
            result = code;
            break;
          case "eth_call":
            result = encodeAbiParameters([{ type: "address" }], [d.collateral_token]);
            break;
          case "eth_getBlockByNumber":
            result = block;
            break;
          case "eth_getLogs":
            result = [eventLog];
            break;
          case "eth_getTransactionReceipt":
            result = receipt;
            break;
          default:
            throw Error("Unexpected mock RPC " + r.method);
        }
        return { jsonrpc: "2.0", id: r.id, result };
      };
      return Response.json(Array.isArray(body) ? body.map(rpc) : rpc(body));
    }
    assert.equal(url.hostname, "lmqaiqvwcytmgwgwyfwx.supabase.co");
    const resource = url.pathname.replace("/rest/v1/", "");
    calls.push({ resource, body });
    let result;
    switch (resource) {
      case "protocol_deployments":
        result = [d];
        break;
      case "protocol_indexer_checkpoints":
        result = [];
        break;
      case "protocol_job_runs":
        result = [{ id: uuid }];
        break;
      case "protocol_markets":
        result = mode === "missing" ? [] : [row];
        break;
      case "rpc/apply_leased_protocol_event":
        result = mode === "malformedAck" ? "true" : mode !== "replay";
        break;
      case "rpc/acquire_protocol_job_lease":
      case "rpc/renew_protocol_job_lease":
      case "rpc/release_protocol_job_lease":
      case "rpc/advance_protocol_checkpoint":
        result = true;
        break;
      case "rpc/finish_protocol_job_run":
        result = null;
        break;
      default:
        throw Error("Unexpected mock DB " + resource);
    }
    return Response.json(result);
  };
  try {
    let error, result;
    try {
      result = await runFinalizedIndexer(
        {
          PROTOCOL_RPC_URL: "https://rpc.invalid",
          SUPABASE_URL: "https://lmqaiqvwcytmgwgwyfwx.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "sb_secret_LOCAL_MOCK_ONLY",
          PROTOCOL_CHAIN_ID: "84532",
        },
        Object.fromEntries(
          keys.map((k) => [
            k,
            {
              abi:
                k === "registry"
                  ? parseAbi(["function collateralToken() view returns (address)"])
                  : k === "exchange"
                    ? abi
                    : [],
            },
          ]),
        ),
        1,
      );
    } catch (e) {
      error = e;
    }
    return { calls, error, result };
  } finally {
    globalThis.fetch = oldFetch;
  }
}
test("actual indexer: missing market halts BEFORE apply/checkpoint and records failed run with lease cleanup", async () => {
  const r = await runMock("missing");
  assert.match(r.error?.message ?? "", /market projection/);
  assert(!r.calls.some((c) => c.resource === "rpc/apply_leased_protocol_event"));
  assert(!r.calls.some((c) => c.resource === "rpc/advance_protocol_checkpoint"));
  assert(
    r.calls.some(
      (c) => c.resource === "rpc/finish_protocol_job_run" && c.body._status === "FAILED",
    ),
  );
  assert.equal(r.calls.at(-1).resource, "rpc/release_protocol_job_lease");
});
test("actual indexer: malformed acknowledgement cannot advance checkpoint", async () => {
  const r = await runMock("malformedAck");
  assert.match(r.error?.message ?? "", /acknowledgement/);
  assert(!r.calls.some((c) => c.resource === "rpc/advance_protocol_checkpoint"));
});
test("actual indexer: valid applied and duplicate-replay events advance through canonical chunk", async () => {
  for (const mode of ["valid", "replay"]) {
    const r = await runMock(mode);
    assert.ifError(r.error);
    assert.equal(r.result.through, "1");
    assert.equal(r.result.applied, mode === "valid" ? 1 : 0);
    assert(r.calls.some((c) => c.resource === "rpc/advance_protocol_checkpoint"));
  }
});
test("guard is wired into the actual indexer before checkpoint advancement", () => {
  const core = readFileSync(new URL("../scripts/indexer-core.mjs", import.meta.url), "utf8");
  assert(core.includes("import { applyProjectedEvent }"));
  assert(
    core.indexOf("await applyProjectedEvent(db,") < core.indexOf("rpc/advance_protocol_checkpoint"),
  );
});
