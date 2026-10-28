import type { RankingActivity, RankingPosition, RankingTrader } from "./core.d.mts";

/** Campaign demo leaderboard — 10 fixed virtual IDs. */
const DEMO = [
  { wallet: "0x111111111111111111111111111111111111a001", name: "NovaFox", vol: "4285000000", pnl: "912400000" },
  { wallet: "0x222222222222222222222222222222222222b002", name: "BaseWolf", vol: "3912000000", pnl: "754100000" },
  { wallet: "0x333333333333333333333333333333333333c003", name: "OrbitKid", vol: "3568000000", pnl: "621800000" },
  { wallet: "0x444444444444444444444444444444444444d004", name: "PulseMint", vol: "3104500000", pnl: "488200000" },
  { wallet: "0x555555555555555555555555555555555555e005", name: "TacRunner", vol: "2879000000", pnl: "356700000" },
  { wallet: "0x666666666666666666666666666666666666f006", name: "ChainLeaf", vol: "2511000000", pnl: "214500000" },
  { wallet: "0x777777777777777777777777777777777777a007", name: "BlueComet", vol: "2198000000", pnl: "98200000" },
  { wallet: "0x888888888888888888888888888888888888b008", name: "QuietEdge", vol: "1843000000", pnl: "-41200000" },
  { wallet: "0x999999999999999999999999999999999999c009", name: "GridPilot", vol: "1526000000", pnl: "-128400000" },
  { wallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaad00a", name: "SoftVault", vol: "1189000000", pnl: "-256900000" },
] as const;

const MARKETS = ["Bitcoin Up/Down", "Ethereum Up/Down", "Solana Up/Down", "BNB Up/Down"] as const;

function demoPositions(i: number): RankingPosition[] {
  return [
    {
      marketId: `demo-mkt-${(i % 4) + 1}`,
      title: MARKETS[i % 4]!,
      outcome: i % 2,
      sharesAtomic: String(BigInt(1_500_000 + i * 220_000) * 1_000_000n),
      settled: i % 3 === 0,
    },
    {
      marketId: `demo-mkt-${((i + 1) % 4) + 1}`,
      title: MARKETS[(i + 1) % 4]!,
      outcome: (i + 1) % 2,
      sharesAtomic: String(BigInt(800_000 + i * 90_000) * 1_000_000n),
      settled: false,
    },
  ];
}

function demoActivity(wallet: string, i: number): RankingActivity[] {
  const now = Date.now();
  return [0, 1, 2].map((j) => ({
    id: `${wallet}-a${j}`,
    marketId: `demo-mkt-${((i + j) % 4) + 1}`,
    title: MARKETS[(i + j) % 4]!,
    side: j % 2 === 0 ? "Buy Up" : "Buy Down",
    amountAtomic: String(BigInt(120_000 + i * 15_000 + j * 8_000) * 1_000_000n),
    timestamp: new Date(now - (j + 1) * 3_600_000 * (i + 1)).toISOString(),
    txHash: `0xdemo${wallet.slice(2, 10)}${j}`,
    outcome: j % 2,
  }));
}

const DEMO_ROWS: RankingTrader[] = DEMO.map((d, i) => ({
  wallet: d.wallet,
  name: d.name,
  volumeAtomic: d.vol,
  pnlAtomic: d.pnl,
  markets: 4 + ((i * 3) % 7),
  settledMarkets: 2 + (i % 5),
  rank: i + 1,
  activity: demoActivity(d.wallet, i),
  positions: demoPositions(i),
}));

export function demoRankingRows(): RankingTrader[] {
  return DEMO_ROWS;
}

export function isDemoTrader(wallet: string | undefined | null) {
  if (!wallet) return false;
  return DEMO.some((d) => d.wallet === wallet.toLowerCase());
}

export function demoTrader(wallet: string): RankingTrader | null {
  return DEMO_ROWS.find((t) => t.wallet === wallet.toLowerCase()) ?? null;
}

/** Prefer live rows; if empty/unavailable, fill with 10 demo traders. */
export function withDemoRankingRows(
  rows:
    | Array<
        Omit<RankingTrader, "activity" | "positions"> &
          Partial<Pick<RankingTrader, "activity" | "positions">>
      >
    | undefined
    | null,
): RankingTrader[] {
  if (rows && rows.length > 0) {
    return rows.map((r) => ({
      ...r,
      activity: r.activity ?? [],
      positions: r.positions ?? [],
    }));
  }
  return DEMO_ROWS;
}
