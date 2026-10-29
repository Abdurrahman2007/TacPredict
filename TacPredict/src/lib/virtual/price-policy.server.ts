import { encodeAbiParameters, getAddress, keccak256, toHex } from "viem";
import { BASE_CHAINLINK_FEEDS, BASE_SEQUENCER_FEED, isChainlinkAsset } from "./chainlink-feeds";
import { virtualPriceAmmAbi } from "./price-abi";
import type { virtualRuntime, metadataSchema } from "./runtime.server";
import type { z } from "zod";
export async function assertPricePolicy(
  r: Awaited<ReturnType<typeof virtualRuntime>>,
  meta: z.infer<typeof metadataSchema>,
) {
  if (meta.resolutionSpec?.kind !== "crypto" || !meta.pricePolicyHash || meta.outcomes.length !== 2)
    throw Error("Feed-priced binary market policy required");
  const p = await r.client.readContract({
    address: r.deployment.engine,
    abi: virtualPriceAmmAbi,
    functionName: "pricePolicies",
    args: [BigInt(meta.id)],
  });
  if (
    p[2] !== toHex(meta.resolutionSpec.asset, { size: 32 }) ||
    p[12] !== (meta.resolutionSpec.tie === "void")
  )
    throw Error("Asset or tie rule disagrees with frozen onchain policy");
  // pricePolicies tuple: feed=p[0], sequencer=p[1], maxAge=p[3]
  if (!isChainlinkAsset(meta.resolutionSpec.asset))
    throw Error("Chainlink feed is not configured for this asset; trading blocked.");
  const expected = BASE_CHAINLINK_FEEDS[meta.resolutionSpec.asset];
  if (
    getAddress(p[0]) !== getAddress(expected.address) ||
    getAddress(p[1]) !== getAddress(BASE_SEQUENCER_FEED) ||
    Number(p[3]) === 0 ||
    Number(p[3]) > expected.recommendedMaxAgeSeconds
  )
    throw Error("Onchain price policy does not use the approved Base Chainlink feeds.");
  const getter = virtualPriceAmmAbi.find(
    (a) => a.type === "function" && a.name === "pricePolicies",
  )!;
  if (keccak256(encodeAbiParameters(getter.outputs, p)) !== meta.pricePolicyHash)
    throw Error("Price policy hash mismatch");
}
