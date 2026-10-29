import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchVirtualUpDownMarket,
  resolveUpDownTradeMarket,
} from "../../../src/lib/virtual/updown-virtual-bind.ts";
import { planWindowCreations, futureWindows } from "../../../src/lib/virtual/lifecycle.ts";

const sepolia = {
  id: "84532:0xcf59:0xbcc5",
  chainId: 84532,
  engine: "0xCF59F3Ff524cC1bD4e11177937D3BCBE62860E46",
  codeHash: "0xbcc5446f4cb392475d4c7a98bb1d3c1948b3d345e2410c84cabdc0e109113535",
  startBlock: "1",
  enabled: true,
  model: "feed-v1",
};

const mainnet = { ...sepolia, id: "8453:x", chainId: 8453, enabled: true };

test("matchVirtualUpDownMarket: asset + open/close within slack", () => {
  const start = 1_700_000_000_000;
  const end = start + 300_000;
  const hit = {
    id: "VIRT-1",
    title: "Bitcoin Up or Down — 5m",
    category: "Crypto",
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    closesAt: "",
    volume: "0",
    participants: 0,
    outcomes: [
      { id: "0", label: "Up", probability: 50 },
      { id: "1", label: "Down", probability: 50 },
    ],
    description: "",
    source: "x",
    sourceUrl: "https://example.com",
    resolutionCriteria: "",
    virtual: { deployment: sepolia, onchainId: "7" },
  };
  assert.equal(matchVirtualUpDownMarket([hit], "bitcoin", { start, end })?.id, "VIRT-1");
  assert.equal(
    matchVirtualUpDownMarket([hit], "bitcoin", { start: start + 10_000, end }),
    undefined,
  );
  assert.equal(matchVirtualUpDownMarket([hit], "ethereum", { start, end }), undefined);
});

test("resolveUpDownTradeMarket: paper without binding; onchain when Sepolia enabled", () => {
  const paper = { id: "reference-bitcoin-1-5", title: "paper" };
  const virt = {
    id: "VIRT-1",
    title: "BTC",
    virtual: { deployment: sepolia, onchainId: "1" },
  };
  assert.equal(resolveUpDownTradeMarket({ paperMarket: paper }).mode, "paper");
  assert.equal(
    resolveUpDownTradeMarket({ virtualMarket: virt, paperMarket: paper }).mode,
    "onchain",
  );
  assert.equal(
    resolveUpDownTradeMarket({
      virtualMarket: { ...virt, virtual: { deployment: mainnet, onchainId: "1" } },
      paperMarket: paper,
    }).mode,
    "paper",
  );
});

test("planWindowCreations skips existing keys", () => {
  const now = 1_700_000_000;
  const existing = new Set(futureWindows("BTC", 300, now, 1).map((w) => w.key));
  const plans = planWindowCreations({
    assets: ["BTC"],
    intervalsSeconds: [300],
    now,
    count: 2,
    existingKeys: existing,
  });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].action, "createWindow");
  assert.ok(plans[0].idempotencyKey.startsWith("createWindow:"));
});
