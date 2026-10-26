// Generated from separate review-only VirtualPriceAMM. No deployment configured.
export const virtualPriceAmmAbi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "admin",
        type: "address",
      },
      {
        internalType: "uint128",
        name: "seedBudget_",
        type: "uint128",
      },
      {
        internalType: "uint128",
        name: "grantBudget_",
        type: "uint128",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "AccessControlBadConfirmation",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "neededRole",
        type: "bytes32",
      },
    ],
    name: "AccessControlUnauthorizedAccount",
    type: "error",
  },
  {
    inputs: [],
    name: "AlreadyTraded",
    type: "error",
  },
  {
    inputs: [],
    name: "Balance",
    type: "error",
  },
  {
    inputs: [],
    name: "Closed",
    type: "error",
  },
  {
    inputs: [],
    name: "Invalid",
    type: "error",
  },
  {
    inputs: [],
    name: "Liquidity",
    type: "error",
  },
  {
    inputs: [],
    name: "NotFinal",
    type: "error",
  },
  {
    inputs: [],
    name: "Paused",
    type: "error",
  },
  {
    inputs: [],
    name: "Replay",
    type: "error",
  },
  {
    inputs: [],
    name: "Slippage",
    type: "error",
  },
  {
    inputs: [],
    name: "Stale",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "campaignId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "root",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint128",
        name: "budget",
        type: "uint128",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "endsAt",
        type: "uint64",
      },
    ],
    name: "CampaignConfigured",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "campaignId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bool",
        name: "paused",
        type: "bool",
      },
      {
        indexed: false,
        internalType: "bool",
        name: "cancelled",
        type: "bool",
      },
    ],
    name: "CampaignState",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "month",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "campaignId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "eligibilityHash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "startsAt",
        type: "uint64",
      },
      {
        indexed: false,
        internalType: "uint128",
        name: "maxPerWallet",
        type: "uint128",
      },
    ],
    name: "MonthlyCampaign",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "marketId",
        type: "uint256",
      },
      {
        components: [
          {
            internalType: "bytes32",
            name: "rulesHash",
            type: "bytes32",
          },
          {
            internalType: "uint64",
            name: "openAt",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "closeAt",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "resolveAfter",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "resolutionDeadline",
            type: "uint64",
          },
          {
            internalType: "uint32",
            name: "challengePeriod",
            type: "uint32",
          },
          {
            internalType: "uint64",
            name: "seed",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "reserveFloor",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "maxCashIn",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "maxSharesIn",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "maxPosition",
            type: "uint64",
          },
          {
            internalType: "uint16",
            name: "feeBps",
            type: "uint16",
          },
          {
            internalType: "uint8",
            name: "outcomes",
            type: "uint8",
          },
        ],
        indexed: false,
        internalType: "struct VirtualPriceAMM.Terms",
        name: "terms",
        type: "tuple",
      },
    ],
    name: "PoolCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "wallet",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "marketId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint128",
        name: "payout",
        type: "uint128",
      },
      {
        indexed: false,
        internalType: "int256",
        name: "realizedPnlDelta",
        type: "int256",
      },
      {
        indexed: false,
        internalType: "uint128",
        name: "cashAfter",
        type: "uint128",
      },
    ],
    name: "PositionSettled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "marketId",
        type: "uint256",
      },
      {
        components: [
          {
            internalType: "address",
            name: "feed",
            type: "address",
          },
          {
            internalType: "address",
            name: "sequencer",
            type: "address",
          },
          {
            internalType: "bytes32",
            name: "asset",
            type: "bytes32",
          },
          {
            internalType: "uint32",
            name: "maxAge",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "boundaryTolerance",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "sigmaPpm",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "spreadPpm",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "impactPpm",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "skewPpm",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "minProbabilityPpm",
            type: "uint32",
          },
          {
            internalType: "uint128",
            name: "minSpot",
            type: "uint128",
          },
          {
            internalType: "uint128",
            name: "maxSpot",
            type: "uint128",
          },
          {
            internalType: "bool",
            name: "tieVoids",
            type: "bool",
          },
        ],
        indexed: false,
        internalType: "struct VirtualPriceAMM.PricePolicy",
        name: "policy",
        type: "tuple",
      },
    ],
    name: "PricePolicyFrozen",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "marketId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "evidenceHash",
        type: "bytes32",
      },
    ],
    name: "ResultChallenged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "marketId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "winner",
        type: "uint8",
      },
      {
        indexed: false,
        internalType: "bool",
        name: "voided",
        type: "bool",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "evidenceHash",
        type: "bytes32",
      },
    ],
    name: "ResultFinalized",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "marketId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "winner",
        type: "uint8",
      },
      {
        indexed: false,
        internalType: "bool",
        name: "voided",
        type: "bool",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "evidenceHash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "challengeUntil",
        type: "uint64",
      },
    ],
    name: "ResultProposed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "previousAdminRole",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "newAdminRole",
        type: "bytes32",
      },
    ],
    name: "RoleAdminChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
    ],
    name: "RoleGranted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
    ],
    name: "RoleRevoked",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "marketId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint80",
        name: "round",
        type: "uint80",
      },
      {
        indexed: false,
        internalType: "uint128",
        name: "price",
        type: "uint128",
      },
    ],
    name: "StartPriceCaptured",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "wallet",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "marketId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "nonce",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "outcome",
        type: "uint8",
      },
      {
        indexed: false,
        internalType: "bool",
        name: "isBuy",
        type: "bool",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "input",
        type: "uint64",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "output",
        type: "uint64",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "fee",
        type: "uint64",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "revision",
        type: "uint64",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "remainingShares",
        type: "uint64",
      },
      {
        indexed: false,
        internalType: "uint128",
        name: "remainingBasis",
        type: "uint128",
      },
      {
        indexed: false,
        internalType: "int256",
        name: "realizedPnlDelta",
        type: "int256",
      },
      {
        indexed: false,
        internalType: "uint128",
        name: "cashAfter",
        type: "uint128",
      },
    ],
    name: "TradeExecuted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "marketId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bool",
        name: "paused",
        type: "bool",
      },
    ],
    name: "TradingPauseChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "campaignId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "wallet",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint128",
        name: "amount",
        type: "uint128",
      },
    ],
    name: "VirtualGrant",
    type: "event",
  },
  {
    inputs: [],
    name: "ARBITER_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "CREATOR_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "DEFAULT_ADMIN_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "GUARDIAN_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "PROPOSER_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "UNIT",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "WATCHER_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "actionNonce",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "uint8",
        name: "winner",
        type: "uint8",
      },
      {
        internalType: "bool",
        name: "voided",
        type: "bool",
      },
      {
        internalType: "bytes32",
        name: "evidenceHash",
        type: "bytes32",
      },
    ],
    name: "adjudicate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "uint8",
        name: "outcome",
        type: "uint8",
      },
      {
        internalType: "uint64",
        name: "amount",
        type: "uint64",
      },
      {
        internalType: "uint64",
        name: "minOut",
        type: "uint64",
      },
      {
        internalType: "uint64",
        name: "revision",
        type: "uint64",
      },
      {
        internalType: "uint64",
        name: "deadline",
        type: "uint64",
      },
      {
        internalType: "uint256",
        name: "nonce",
        type: "uint256",
      },
    ],
    name: "buy",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "campaignBudgetReserved",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "campaignClaimed",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "campaignCount",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "campaigns",
    outputs: [
      {
        internalType: "bytes32",
        name: "root",
        type: "bytes32",
      },
      {
        internalType: "uint128",
        name: "budget",
        type: "uint128",
      },
      {
        internalType: "uint128",
        name: "used",
        type: "uint128",
      },
      {
        internalType: "uint64",
        name: "endsAt",
        type: "uint64",
      },
      {
        internalType: "uint64",
        name: "startsAt",
        type: "uint64",
      },
      {
        internalType: "uint128",
        name: "maxPerWallet",
        type: "uint128",
      },
      {
        internalType: "bool",
        name: "paused",
        type: "bool",
      },
      {
        internalType: "bool",
        name: "cancelled",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "uint80",
        name: "round",
        type: "uint80",
      },
    ],
    name: "captureStart",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "cash",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "bytes32",
        name: "evidenceHash",
        type: "bytes32",
      },
    ],
    name: "challenge",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "uint128",
        name: "amount",
        type: "uint128",
      },
      {
        internalType: "bytes32[]",
        name: "proof",
        type: "bytes32[]",
      },
    ],
    name: "claimGrant",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "claimable",
    outputs: [
      {
        internalType: "uint128",
        name: "payout",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
      {
        internalType: "uint64",
        name: "",
        type: "uint64",
      },
    ],
    name: "configureCampaign",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "month",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "root",
        type: "bytes32",
      },
      {
        internalType: "uint128",
        name: "budget",
        type: "uint128",
      },
      {
        internalType: "uint64",
        name: "startsAt",
        type: "uint64",
      },
      {
        internalType: "uint64",
        name: "endsAt",
        type: "uint64",
      },
      {
        internalType: "uint128",
        name: "maxPerWallet",
        type: "uint128",
      },
      {
        internalType: "bytes32",
        name: "eligibilityHash",
        type: "bytes32",
      },
    ],
    name: "configureMonthlyCampaign",
    outputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        components: [
          {
            internalType: "address",
            name: "feed",
            type: "address",
          },
          {
            internalType: "address",
            name: "sequencer",
            type: "address",
          },
          {
            internalType: "bytes32",
            name: "asset",
            type: "bytes32",
          },
          {
            internalType: "uint32",
            name: "maxAge",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "boundaryTolerance",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "sigmaPpm",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "spreadPpm",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "impactPpm",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "skewPpm",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "minProbabilityPpm",
            type: "uint32",
          },
          {
            internalType: "uint128",
            name: "minSpot",
            type: "uint128",
          },
          {
            internalType: "uint128",
            name: "maxSpot",
            type: "uint128",
          },
          {
            internalType: "bool",
            name: "tieVoids",
            type: "bool",
          },
        ],
        internalType: "struct VirtualPriceAMM.PricePolicy",
        name: "c",
        type: "tuple",
      },
    ],
    name: "configurePricePolicy",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "bytes32",
            name: "rulesHash",
            type: "bytes32",
          },
          {
            internalType: "uint64",
            name: "openAt",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "closeAt",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "resolveAfter",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "resolutionDeadline",
            type: "uint64",
          },
          {
            internalType: "uint32",
            name: "challengePeriod",
            type: "uint32",
          },
          {
            internalType: "uint64",
            name: "seed",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "reserveFloor",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "maxCashIn",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "maxSharesIn",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "maxPosition",
            type: "uint64",
          },
          {
            internalType: "uint16",
            name: "feeBps",
            type: "uint16",
          },
          {
            internalType: "uint8",
            name: "outcomes",
            type: "uint8",
          },
        ],
        internalType: "struct VirtualPriceAMM.Terms",
        name: "t",
        type: "tuple",
      },
    ],
    name: "createPool",
    outputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "feeSink",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "finalize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
    ],
    name: "getRoleAdmin",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "grantBudget",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "grantRole",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "granted",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "hasRole",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "lockedCollateral",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "markValue",
    outputs: [
      {
        internalType: "uint128",
        name: "value",
        type: "uint128",
      },
      {
        internalType: "int256",
        name: "unrealizedPnl",
        type: "int256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    name: "monthlyCampaign",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "pool",
    outputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "bytes32",
                name: "rulesHash",
                type: "bytes32",
              },
              {
                internalType: "uint64",
                name: "openAt",
                type: "uint64",
              },
              {
                internalType: "uint64",
                name: "closeAt",
                type: "uint64",
              },
              {
                internalType: "uint64",
                name: "resolveAfter",
                type: "uint64",
              },
              {
                internalType: "uint64",
                name: "resolutionDeadline",
                type: "uint64",
              },
              {
                internalType: "uint32",
                name: "challengePeriod",
                type: "uint32",
              },
              {
                internalType: "uint64",
                name: "seed",
                type: "uint64",
              },
              {
                internalType: "uint64",
                name: "reserveFloor",
                type: "uint64",
              },
              {
                internalType: "uint64",
                name: "maxCashIn",
                type: "uint64",
              },
              {
                internalType: "uint64",
                name: "maxSharesIn",
                type: "uint64",
              },
              {
                internalType: "uint64",
                name: "maxPosition",
                type: "uint64",
              },
              {
                internalType: "uint16",
                name: "feeBps",
                type: "uint16",
              },
              {
                internalType: "uint8",
                name: "outcomes",
                type: "uint8",
              },
            ],
            internalType: "struct VirtualPriceAMM.Terms",
            name: "terms",
            type: "tuple",
          },
          {
            internalType: "uint64[3]",
            name: "reserves",
            type: "uint64[3]",
          },
          {
            internalType: "uint128",
            name: "collateral",
            type: "uint128",
          },
          {
            internalType: "uint64",
            name: "revision",
            type: "uint64",
          },
          {
            internalType: "bool",
            name: "paused",
            type: "bool",
          },
          {
            internalType: "bool",
            name: "final_",
            type: "bool",
          },
          {
            internalType: "bool",
            name: "voided",
            type: "bool",
          },
          {
            internalType: "uint8",
            name: "winner",
            type: "uint8",
          },
        ],
        internalType: "struct VirtualPriceAMM.Pool",
        name: "p",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "poolCount",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "",
        type: "address",
      },
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
    ],
    name: "positions",
    outputs: [
      {
        internalType: "uint64",
        name: "shares",
        type: "uint64",
      },
      {
        internalType: "uint128",
        name: "basis",
        type: "uint128",
      },
      {
        internalType: "int256",
        name: "realizedPnl",
        type: "int256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "pricePolicies",
    outputs: [
      {
        internalType: "address",
        name: "feed",
        type: "address",
      },
      {
        internalType: "address",
        name: "sequencer",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "asset",
        type: "bytes32",
      },
      {
        internalType: "uint32",
        name: "maxAge",
        type: "uint32",
      },
      {
        internalType: "uint32",
        name: "boundaryTolerance",
        type: "uint32",
      },
      {
        internalType: "uint32",
        name: "sigmaPpm",
        type: "uint32",
      },
      {
        internalType: "uint32",
        name: "spreadPpm",
        type: "uint32",
      },
      {
        internalType: "uint32",
        name: "impactPpm",
        type: "uint32",
      },
      {
        internalType: "uint32",
        name: "skewPpm",
        type: "uint32",
      },
      {
        internalType: "uint32",
        name: "minProbabilityPpm",
        type: "uint32",
      },
      {
        internalType: "uint128",
        name: "minSpot",
        type: "uint128",
      },
      {
        internalType: "uint128",
        name: "maxSpot",
        type: "uint128",
      },
      {
        internalType: "bool",
        name: "tieVoids",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "probability",
    outputs: [
      {
        internalType: "uint64",
        name: "upPpm",
        type: "uint64",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "proposals",
    outputs: [
      {
        internalType: "bytes32",
        name: "evidenceHash",
        type: "bytes32",
      },
      {
        internalType: "uint64",
        name: "challengeUntil",
        type: "uint64",
      },
      {
        internalType: "bool",
        name: "exists",
        type: "bool",
      },
      {
        internalType: "bool",
        name: "disputed",
        type: "bool",
      },
      {
        internalType: "bool",
        name: "voided",
        type: "bool",
      },
      {
        internalType: "uint8",
        name: "winner",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    name: "propose",
    outputs: [],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "uint80",
        name: "round",
        type: "uint80",
      },
      {
        internalType: "bytes32",
        name: "evidenceHash",
        type: "bytes32",
      },
    ],
    name: "proposeFromFeed",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "protocolSink",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "uint8",
        name: "outcome",
        type: "uint8",
      },
      {
        internalType: "uint64",
        name: "amount",
        type: "uint64",
      },
    ],
    name: "quoteBuy",
    outputs: [
      {
        components: [
          {
            internalType: "uint64",
            name: "output",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "fee",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "revision",
            type: "uint64",
          },
        ],
        internalType: "struct VirtualPriceAMM.Quote",
        name: "q",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "uint8",
        name: "outcome",
        type: "uint8",
      },
      {
        internalType: "uint64",
        name: "amount",
        type: "uint64",
      },
    ],
    name: "quoteSell",
    outputs: [
      {
        components: [
          {
            internalType: "uint64",
            name: "output",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "fee",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "revision",
            type: "uint64",
          },
        ],
        internalType: "struct VirtualPriceAMM.Quote",
        name: "q",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "callerConfirmation",
        type: "address",
      },
    ],
    name: "renounceRole",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "revokeRole",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "seedBudget",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "seeded",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "uint8",
        name: "outcome",
        type: "uint8",
      },
      {
        internalType: "uint64",
        name: "shares",
        type: "uint64",
      },
      {
        internalType: "uint64",
        name: "minOut",
        type: "uint64",
      },
      {
        internalType: "uint64",
        name: "revision",
        type: "uint64",
      },
      {
        internalType: "uint64",
        name: "deadline",
        type: "uint64",
      },
      {
        internalType: "uint256",
        name: "nonce",
        type: "uint256",
      },
    ],
    name: "sell",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "bool",
        name: "paused",
        type: "bool",
      },
      {
        internalType: "bool",
        name: "cancel",
        type: "bool",
      },
    ],
    name: "setCampaignState",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "bool",
        name: "value",
        type: "bool",
      },
    ],
    name: "setPaused",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "settleFor",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "settled",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "startPrice",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "startRound",
    outputs: [
      {
        internalType: "uint80",
        name: "",
        type: "uint80",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "interfaceId",
        type: "bytes4",
      },
    ],
    name: "supportsInterface",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "timeoutVoid",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "totalCash",
    outputs: [
      {
        internalType: "uint128",
        name: "",
        type: "uint128",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "tradingPaused",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
