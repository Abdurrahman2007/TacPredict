export declare const VIRTUAL_SET_CHAIN_ID: 8453;
export declare const VIRTUAL_SET_ADDRESSES: Readonly<{
  usdc: `0x${string}`;
  registry: `0x${string}`;
  oracle: `0x${string}`;
  factory: `0x${string}`;
  positions: `0x${string}`;
  exchange: `0x${string}`;
  settlement: `0x${string}`;
}>;
export declare const VIRTUAL_SET_ADMIN: `0x${string}`;
export declare const VIRTUAL_USDC_DECIMALS: 6;
export declare const VIRTUAL_SET_FLAGS: Readonly<{ executionEnabled: boolean; basescanVerified: boolean }>;
export declare const VIRTUAL_SET_EXPLORER: Readonly<{
  address: (address: string) => string;
  code: (address: string) => string;
}>;
export declare function isVirtualSetAddress(address: unknown): boolean;
export declare function virtualSetBlockers(flags?: { executionEnabled: boolean; basescanVerified: boolean }): string[];
