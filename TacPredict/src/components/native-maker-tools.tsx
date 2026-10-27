import type { NativeMarket, ProtocolDeployment } from "@/lib/protocol/types";
/** Legacy complete-set funding is not part of virtual trading. */
export function NativeMakerTools(_props: {
  market: NativeMarket;
  deployment: ProtocolDeployment | undefined;
}) {
  return null;
}
