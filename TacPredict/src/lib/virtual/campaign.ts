import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  parseAbiParameters,
  concatHex,
  isAddress,
  type Hex,
} from "viem";
export type CampaignDraft = {
  month: string;
  startsAt: number;
  endsAt: number;
  eligibility: string;
  budget: string;
  maxPerWallet: string;
  allocations: { wallet: string; amount: string }[];
};
const uint128 = (s: string) => {
  if (!/^\d{1,39}$/.test(s)) throw Error("Use positive integer Virtual USDC atoms (6 decimals)");
  const n = BigInt(s);
  if (n <= 0n || n >= 2n ** 128n) throw Error("Allocation out of range");
  return n;
};
/** Preview ONLY. Neither constructs a signer nor sends a transaction or grants cash. */
export function previewCampaign(
  d: CampaignDraft,
  engine: Hex,
  chainId: number,
  campaignId: string,
  now: number,
) {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(d.month) ||
    !isAddress(engine) ||
    /^0x0{40}$/i.test(engine) ||
    ![8453, 84532, 31337].includes(chainId) ||
    !/^[1-9]\d{0,76}$/.test(campaignId) ||
    ![d.startsAt, d.endsAt, now].every(Number.isSafeInteger)
  )
    throw Error("Invalid campaign identity/time");
  const monthStart = Date.parse(d.month + "-01T00:00:00Z") / 1000;
  const date = new Date(monthStart * 1000);
  const nextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 1000;
  if (
    d.startsAt < monthStart ||
    d.startsAt < now ||
    d.endsAt > nextMonth ||
    d.endsAt <= d.startsAt ||
    !d.eligibility.trim() ||
    d.eligibility.length > 4000 ||
    d.allocations.length < 1 ||
    d.allocations.length > 10000
  )
    throw Error("Explicit monthly dates, eligibility and bounded allocation list required");
  const budget = uint128(d.budget),
    max = uint128(d.maxPerWallet),
    seen = new Set<string>();
  let sum = 0n;
  const rows = d.allocations
    .map((a) => {
      const wallet = getAddress(a.wallet).toLowerCase() as Hex,
        amount = uint128(a.amount);
      if (/^0x0{40}$/.test(wallet) || seen.has(wallet) || amount > max)
        throw Error("Duplicate wallet or per-user cap exceeded");
      seen.add(wallet);
      sum += amount;
      const leaf = keccak256(
        keccak256(
          encodeAbiParameters(parseAbiParameters("address,uint256,uint256,address,uint128"), [
            engine,
            BigInt(chainId),
            BigInt(campaignId),
            wallet,
            amount,
          ]),
        ),
      );
      return { wallet, amount: amount.toString(), leaf };
    })
    .sort((a, b) => (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0));
  if (max > budget || sum > budget) throw Error("Campaign allocation exceeds budget");
  const levels: Hex[][] = [rows.map((r) => r.leaf)];
  while (levels.at(-1)!.length > 1) {
    const prev = levels.at(-1)!,
      next: Hex[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const x = prev[i]!,
        y = prev[i + 1];
      next.push(y ? keccak256(concatHex([x, y].sort() as [Hex, Hex])) : x);
    }
    levels.push(next);
  }
  const allocations = rows.map((r, i) => {
    const proof: Hex[] = [];
    let n = i;
    for (let j = 0; j < levels.length - 1; j++) {
      const sibling = levels[j]![n ^ 1];
      if (sibling) proof.push(sibling);
      n = Math.floor(n / 2);
    }
    return { ...r, proof };
  });
  return {
    month: d.month,
    monthId: keccak256(new TextEncoder().encode(d.month)),
    engine,
    chainId,
    campaignId,
    root: levels.at(-1)![0]!,
    budget: budget.toString(),
    maxPerWallet: max.toString(),
    allocated: sum.toString(),
    walletCount: rows.length,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    eligibilityHash: keccak256(new TextEncoder().encode(d.eligibility)),
    allocations,
    state: "draft" as const,
    publicClaimsEnabled: false as const,
  };
}
