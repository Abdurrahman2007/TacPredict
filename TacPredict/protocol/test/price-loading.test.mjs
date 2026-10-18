import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSync } from "esbuild";
test("spot prices never wait for four history calls; histories are cached separately", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tac-spot-"));
  const out = path.join(dir, "coingecko.mjs");
  buildSync({
    entryPoints: ["src/lib/coingecko.server.ts"],
    bundle: true,
    write: true,
    outfile: out,
    platform: "node",
    format: "esm",
  });
  const previous = globalThis.fetch,
    key = process.env.COINGECKO_DEMO_API_KEY;
  process.env.COINGECKO_DEMO_API_KEY = "unit-fixture-not-a-real-key";
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const now = Math.floor(Date.now() / 1000);
    return Response.json(
      String(url).includes("/simple/price")
        ? Object.fromEntries(
            ["bitcoin", "ethereum", "solana", "binancecoin"].map((a) => [
              a,
              { usd: 100, last_updated_at: now, usd_24h_change: 1 },
            ]),
          )
        : {
            prices: [
              [Date.now() - 120000, 98],
              [Date.now() - 60000, 99],
              [Date.now(), 100],
            ],
          },
    );
  };
  try {
    const m = await import(out);
    const s = await m.coingeckoSnapshot();
    assert.equal(calls.length, 1);
    assert.equal(s.ethereum.price, 100);
    assert.equal(s.bnb.price, 100);
    await m.coingeckoAssetHistory("bitcoin");
    await m.coingeckoAssetHistory("bitcoin");
    assert.equal(calls.length, 2);
    await m.coingeckoAssetHistory("bnb");
    assert.ok(calls.some((u) => u.includes("/coins/binancecoin/market_chart")));
    await assert.rejects(m.coingeckoAssetHistory("wrong"));
  } finally {
    globalThis.fetch = previous;
    if (key === undefined) delete process.env.COINGECKO_DEMO_API_KEY;
    else process.env.COINGECKO_DEMO_API_KEY = key;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("spot-only edge snapshots do not mask full history, and full history is reused across workers", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tac-history-"));
  const out = path.join(dir, "coingecko.mjs");
  buildSync({
    entryPoints: ["src/lib/coingecko.server.ts"],
    bundle: true,
    write: true,
    outfile: out,
    platform: "node",
    format: "esm",
  });
  const previousFetch = globalThis.fetch,
    previousCaches = Object.getOwnPropertyDescriptor(globalThis, "caches"),
    oldKey = process.env.COINGECKO_DEMO_API_KEY;
  process.env.COINGECKO_DEMO_API_KEY = "unit-fixture-not-a-real-key";
  const now = Date.now(),
    prices = Array.from({ length: 13 }, (_, i) => [now - 3600000 + i * 300000, 100 + i]);
  const spotPoints = [
    { time: now - 60000, price: 110 },
    { time: now, price: 112 },
  ];
  const spot = {
    source: "CoinGecko",
    updatedAt: new Date(now).toISOString(),
    histories: Object.fromEntries(
      ["bitcoin", "ethereum", "solana", "bnb"].map((a) => [a, spotPoints]),
    ),
  };
  const cache = new Map([
    ["https://tacpredict.fun/__cache/coingecko/snapshot-v3", Response.json(spot)],
  ]);
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      default: {
        match: async (key) => cache.get(key)?.clone(),
        put: async (key, response) => {
          cache.set(key, response.clone());
        },
      },
    },
  });
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.ok(String(url).includes("/coins/bitcoin/market_chart"));
    return Response.json({ prices });
  };
  try {
    const first = await import(out + "?worker=one");
    await first.coingeckoSnapshot();
    assert.equal(calls, 0);
    assert.equal((await first.coingeckoAssetHistory("bitcoin")).length, 13);
    assert.equal(calls, 1);
    const second = await import(out + "?worker=two");
    assert.equal((await second.coingeckoAssetHistory("bitcoin")).length, 13);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousCaches) Object.defineProperty(globalThis, "caches", previousCaches);
    else delete globalThis.caches;
    if (oldKey === undefined) delete process.env.COINGECKO_DEMO_API_KEY;
    else process.env.COINGECKO_DEMO_API_KEY = oldKey;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
