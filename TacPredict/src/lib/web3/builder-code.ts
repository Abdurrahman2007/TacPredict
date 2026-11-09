import type { Hex } from "viem";

/**
 * Base Dashboard Builder Code (Settings → Project Settings → Builder Code).
 * ERC-8021 attribution suffix is appended to user transaction calldata.
 * @see https://docs.base.org/specifications/builder-codes/for-app-developers
 */
export const BASE_BUILDER_CODE = "bc_2wvy2xpi" as const;

/** Encoded ERC-8021 dataSuffix from Base Dashboard (Encoded String format). */
export const BASE_BUILDER_DATA_SUFFIX =
  "0x62635f32777679327870690b0080218021802180218021802180218021" as Hex;

/** EIP-5792 capability payload for wallet_sendCalls. */
export const BASE_BUILDER_DATA_SUFFIX_CAPABILITY = {
  value: BASE_BUILDER_DATA_SUFFIX,
  optional: true,
} as const;
