import { getAddress, type Address } from "viem";

/**
 * The six legacy Base Mainnet contracts (verified on BaseScan + Sourcify).
 * Source of truth: protocol/deployments/base-mainnet.json + base-mainnet.sources.json.
 * VirtualPriceAMM paper trading is a separate engine and must not replace these.
 */
export type VerifiedMainnetContract = {
  name: string;
  address: Address;
  basescanUrl: string;
  sourcifyUrl: string;
  verifiedAt: string;
};

export const VERIFIED_MAINNET_DEPLOYMENT = {
  chainId: 8453 as const,
  verified: true as const,
  tradingEnabled: false as const,
  admin: getAddress("0x57828f1aa32fd6be3988f240068df53ed94b7aef"),
  collateralToken: getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
  deploymentBlock: "52453630",
  txHash: "0x2b707200f70fb3d9c7598605f3d7cf57a05bded84842742b362004e82b4a0966" as const,
  contracts: [
    {
      name: "Registry",
      address: getAddress("0x8aCC19eb2F3DCCEdA99Af89cC30416D17f02cd0A"),
      basescanUrl: "https://basescan.org/address/0x8aCC19eb2F3DCCEdA99Af89cC30416D17f02cd0A#code",
      sourcifyUrl:
        "https://sourcify.dev/server/v2/contract/8453/0x8aCC19eb2F3DCCEdA99Af89cC30416D17f02cd0A",
      verifiedAt: "2026-10-11T06:51:37Z",
    },
    {
      name: "Factory",
      address: getAddress("0xe01c23aac6f152a2eA437A7E6Eb0a664A1908568"),
      basescanUrl: "https://basescan.org/address/0xe01c23aac6f152a2eA437A7E6Eb0a664A1908568#code",
      sourcifyUrl:
        "https://sourcify.dev/server/v2/contract/8453/0xe01c23aac6f152a2eA437A7E6Eb0a664A1908568",
      verifiedAt: "2026-10-11T06:51:35Z",
    },
    {
      name: "Positions",
      address: getAddress("0x00adb2c69B58f66aB64DDb0Da01B7C72A3E8F2A7"),
      basescanUrl: "https://basescan.org/address/0x00adb2c69B58f66aB64DDb0Da01B7C72A3E8F2A7#code",
      sourcifyUrl:
        "https://sourcify.dev/server/v2/contract/8453/0x00adb2c69B58f66aB64DDb0Da01B7C72A3E8F2A7",
      verifiedAt: "2026-10-11T06:51:38Z",
    },
    {
      name: "Exchange",
      address: getAddress("0x7e5e40bAE779ebabB2295Ef6d009ab95b0307F85"),
      basescanUrl: "https://basescan.org/address/0x7e5e40bAE779ebabB2295Ef6d009ab95b0307F85#code",
      sourcifyUrl:
        "https://sourcify.dev/server/v2/contract/8453/0x7e5e40bAE779ebabB2295Ef6d009ab95b0307F85",
      verifiedAt: "2026-10-11T06:51:37Z",
    },
    {
      name: "Oracle",
      address: getAddress("0xF50797C34B214C81B80A9bd3e590C3cA0DF8118f"),
      basescanUrl: "https://basescan.org/address/0xF50797C34B214C81B80A9bd3e590C3cA0DF8118f#code",
      sourcifyUrl:
        "https://sourcify.dev/server/v2/contract/8453/0xF50797C34B214C81B80A9bd3e590C3cA0DF8118f",
      verifiedAt: "2026-10-11T06:51:37Z",
    },
    {
      name: "Settlement",
      address: getAddress("0x9b272C68F3338655a440B44DBc9CCB993D7650B3"),
      basescanUrl: "https://basescan.org/address/0x9b272C68F3338655a440B44DBc9CCB993D7650B3#code",
      sourcifyUrl:
        "https://sourcify.dev/server/v2/contract/8453/0x9b272C68F3338655a440B44DBc9CCB993D7650B3",
      verifiedAt: "2026-10-11T06:51:37Z",
    },
  ] satisfies VerifiedMainnetContract[],
};
