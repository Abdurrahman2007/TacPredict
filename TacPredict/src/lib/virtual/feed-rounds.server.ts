import type { Address, PublicClient } from "viem";

const roundAbi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
  {
    type: "function",
    name: "getRoundData",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint80" }],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

type ReadClient = Pick<PublicClient, "readContract">;

/**
 * First AggregatorV3 round at/after `boundary`, with predecessor strictly before boundary,
 * and observation within `toleranceSeconds` — matches VirtualPriceAMM._boundary.
 * Fail closed when no such round exists yet.
 */
export async function findBoundaryRound(
  client: ReadClient,
  feed: Address,
  boundary: bigint,
  toleranceSeconds: number,
): Promise<bigint> {
  if (!Number.isInteger(toleranceSeconds) || toleranceSeconds < 1 || toleranceSeconds > 300)
    throw Error("Invalid boundary tolerance");
  const [latestId] = await client.readContract({
    address: feed,
    abi: roundAbi,
    functionName: "latestRoundData",
  });
  if (latestId <= 1n) throw Error("Chainlink round history unavailable for boundary");

  // Walk back from latest (bounded) until we cross the open/close boundary.
  const maxWalk = 512n;
  let id = latestId;
  let walked = 0n;
  while (id > 1n && walked < maxWalk) {
    const [rid, answer, , updated, answered] = await client.readContract({
      address: feed,
      abi: roundAbi,
      functionName: "getRoundData",
      args: [id],
    });
    if (rid !== id || answered < id || answer <= 0n || updated === 0n) {
      id -= 1n;
      walked += 1n;
      continue;
    }
    if (updated < boundary) break; // gone past the boundary; candidate is newer
    if (updated <= boundary + BigInt(toleranceSeconds)) {
      const [prid, panswer, , pUpdated, pAnswered] = await client.readContract({
        address: feed,
        abi: roundAbi,
        functionName: "getRoundData",
        args: [id - 1n],
      });
      if (
        prid === id - 1n &&
        pAnswered >= prid &&
        panswer > 0n &&
        pUpdated > 0n &&
        pUpdated < boundary &&
        pUpdated < updated
      )
        return id;
    }
    id -= 1n;
    walked += 1n;
  }
  throw Error("No Chainlink round satisfies the market boundary yet");
}
