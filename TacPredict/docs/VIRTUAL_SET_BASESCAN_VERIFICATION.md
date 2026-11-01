# Verifying the virtual set on Basescan

Done by hand, once per contract, from a phone or a computer. Nothing here needs a private key, and the Basescan API key is not used: keep any key out of chat and out of this repository.

**File to upload (the same for all seven):** `protocol/deployments/virtual-base-mainnet.standard-input.json` (sha256 `a79cabc11e98792aa1216435f5720680219f4b99c9ca14f50ecfd853f919d2a9`). It holds the 7 Virtual*.sol files and the 36 OpenZeppelin 5.2.0 files they import, with the exact compiler settings. A recompile from it reproduces the deployed creation and runtime bytecode of all seven contracts.

## Settings (same for every contract)

- Basescan: open the contract address, **Contract** tab, **Verify and Publish**.
- Compiler type: **Solidity (Standard-Json-Input)**.
- Compiler version: **v0.8.30+commit.73712a01**.
- License: **MIT**.
- Upload the JSON file above.
- The optimizer (200 runs), viaIR and the Shanghai EVM target are already inside the JSON, so there is nothing else to set.
- **Contract Name** and **Constructor Arguments** differ per contract: see the table.
- Constructor arguments are the ABI-encoded hex **without** the leading `0x`. If Basescan asks, the contract was created through the CREATE2 proxy `0x4e59b44847b379578588920cA78FbF26c0B4956C`.

## Per contract

| # | Contract name to enter | Address | Constructor arguments (hex, no 0x) |
| --- | --- | --- | --- |
| 1 | `contracts/VirtualUSDC.sol:VirtualUSDC` | [`0x21b3932c2D8FC7178cC5Ea1083e98877211FD196`](https://basescan.org/address/0x21b3932c2D8FC7178cC5Ea1083e98877211FD196#code) | `00000000000000000000000057828f1aa32fd6be3988f240068df53ed94b7aef000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003e8` |
| 2 | `contracts/VirtualMarketRegistry.sol:VirtualMarketRegistry` | [`0x49D7015ABddEBA550F6138f4ccF914B417237C0D`](https://basescan.org/address/0x49D7015ABddEBA550F6138f4ccF914B417237C0D#code) | `00000000000000000000000057828f1aa32fd6be3988f240068df53ed94b7aef00000000000000000000000021b3932c2d8fc7178cc5ea1083e98877211fd196` |
| 3 | `contracts/VirtualResolutionOracle.sol:VirtualResolutionOracle` | [`0x99bcc662cd9716Ce4bd66571f12A8B07295FcF3F`](https://basescan.org/address/0x99bcc662cd9716Ce4bd66571f12A8B07295FcF3F#code) | `00000000000000000000000057828f1aa32fd6be3988f240068df53ed94b7aef00000000000000000000000049d7015abddeba550f6138f4ccf914b417237c0d00000000000000000000000000000000000000000000000000000000004c4b40000000000000000000000000000000000000000000000000000000000000003c` |
| 4 | `contracts/VirtualMarketFactory.sol:VirtualMarketFactory` | [`0x35bBCe6fc02F565bccBe0FF5290B96770D3f5903`](https://basescan.org/address/0x35bBCe6fc02F565bccBe0FF5290B96770D3f5903#code) | `00000000000000000000000057828f1aa32fd6be3988f240068df53ed94b7aef00000000000000000000000049d7015abddeba550f6138f4ccf914b417237c0d00000000000000000000000099bcc662cd9716ce4bd66571f12a8b07295fcf3f` |
| 5 | `contracts/VirtualConditionalPositions.sol:VirtualConditionalPositions` | [`0xF2973A60903b8E58098A144b07105f2A45dF6156`](https://basescan.org/address/0xF2973A60903b8E58098A144b07105f2A45dF6156#code) | `00000000000000000000000049d7015abddeba550f6138f4ccf914b417237c0d` |
| 6 | `contracts/VirtualExchange.sol:VirtualExchange` | [`0x716345BE42D1Ac79232721d3f4E37B9F4bBF48cB`](https://basescan.org/address/0x716345BE42D1Ac79232721d3f4E37B9F4bBF48cB#code) | `00000000000000000000000049d7015abddeba550f6138f4ccf914b417237c0d000000000000000000000000f2973a60903b8e58098a144b07105f2a45df6156` |
| 7 | `contracts/VirtualSettlement.sol:VirtualSettlement` | [`0x567C1128Be6C0c0b9b18C96459D09Cf539Fcbd59`](https://basescan.org/address/0x567C1128Be6C0c0b9b18C96459D09Cf539Fcbd59#code) | `00000000000000000000000049d7015abddeba550f6138f4ccf914b417237c0d000000000000000000000000f2973a60903b8e58098a144b07105f2a45df6156` |

Verify in this order (it does not matter to Basescan, but it matches the deployment): VirtualUSDC, VirtualMarketRegistry, VirtualResolutionOracle, VirtualMarketFactory, VirtualConditionalPositions, VirtualExchange, VirtualSettlement.

## After it is done

1. Open each `#code` link and check the green tick.
2. Set `basescan_verified` to `true` in `protocol/deployments/virtual-base-mainnet.json` and `basescanVerified` to `true` in `src/lib/virtual-set/deployment.mjs` (a test keeps them equal). That flag alone does not turn trading on.

## Notes

- The immutable slots of the initcode were filled with `0x01..0x20` before deployment (see the manifest notes); the constructor overwrites them, so Basescan compares the same runtime bytecode as a plain compile. If Basescan reports a creation-code mismatch for that reason but accepts the runtime bytecode, that is expected.
- Sourcify accepts the same Standard JSON; it is optional.
