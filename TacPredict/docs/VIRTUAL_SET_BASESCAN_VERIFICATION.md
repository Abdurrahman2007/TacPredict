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
| 1 | `contracts/VirtualUSDC.sol:VirtualUSDC` | [`0xe595d15d0824705d26483c6FdABFa45693bb071e`](https://basescan.org/address/0xe595d15d0824705d26483c6FdABFa45693bb071e#code) | `00000000000000000000000057828f1aa32fd6be3988f240068df53ed94b7aef000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003e8` |
| 2 | `contracts/VirtualMarketRegistry.sol:VirtualMarketRegistry` | [`0xCd98E90223C7E04ac7987A2fAb6a71Ba4aA6f013`](https://basescan.org/address/0xCd98E90223C7E04ac7987A2fAb6a71Ba4aA6f013#code) | `00000000000000000000000057828f1aa32fd6be3988f240068df53ed94b7aef000000000000000000000000e595d15d0824705d26483c6fdabfa45693bb071e` |
| 3 | `contracts/VirtualResolutionOracle.sol:VirtualResolutionOracle` | [`0x6A22091A157013eFb7bD2388A280573662Dd5b21`](https://basescan.org/address/0x6A22091A157013eFb7bD2388A280573662Dd5b21#code) | `00000000000000000000000057828f1aa32fd6be3988f240068df53ed94b7aef000000000000000000000000cd98e90223c7e04ac7987a2fab6a71ba4aa6f01300000000000000000000000000000000000000000000000000000000004c4b40000000000000000000000000000000000000000000000000000000000000003c` |
| 4 | `contracts/VirtualMarketFactory.sol:VirtualMarketFactory` | [`0xbf17837221F202CBFF642b8C049D6a4Cc1d031d8`](https://basescan.org/address/0xbf17837221F202CBFF642b8C049D6a4Cc1d031d8#code) | `00000000000000000000000057828f1aa32fd6be3988f240068df53ed94b7aef000000000000000000000000cd98e90223c7e04ac7987a2fab6a71ba4aa6f0130000000000000000000000006a22091a157013efb7bd2388a280573662dd5b21` |
| 5 | `contracts/VirtualConditionalPositions.sol:VirtualConditionalPositions` | [`0x4A2584bbB19fEf7df240e6d0787fd82d8175b554`](https://basescan.org/address/0x4A2584bbB19fEf7df240e6d0787fd82d8175b554#code) | `000000000000000000000000cd98e90223c7e04ac7987a2fab6a71ba4aa6f013` |
| 6 | `contracts/VirtualExchange.sol:VirtualExchange` | [`0xEc947763fEe77917218732A3dcffAE0e0A40409B`](https://basescan.org/address/0xEc947763fEe77917218732A3dcffAE0e0A40409B#code) | `000000000000000000000000cd98e90223c7e04ac7987a2fab6a71ba4aa6f0130000000000000000000000004a2584bbb19fef7df240e6d0787fd82d8175b554` |
| 7 | `contracts/VirtualSettlement.sol:VirtualSettlement` | [`0x27eB22dF79D5aa59759c4e15a49bA1f27147ddbF`](https://basescan.org/address/0x27eB22dF79D5aa59759c4e15a49bA1f27147ddbF#code) | `000000000000000000000000cd98e90223c7e04ac7987a2fab6a71ba4aa6f0130000000000000000000000004a2584bbb19fef7df240e6d0787fd82d8175b554` |

Verify in this order (it does not matter to Basescan, but it matches the deployment): VirtualUSDC, VirtualMarketRegistry, VirtualResolutionOracle, VirtualMarketFactory, VirtualConditionalPositions, VirtualExchange, VirtualSettlement.

## After it is done

1. Open each `#code` link and check the green tick.
2. Set `basescan_verified` to `true` in `protocol/deployments/virtual-base-mainnet.json` and `basescanVerified` to `true` in `src/lib/virtual-set/deployment.mjs` (a test keeps them equal). That flag alone does not turn trading on.

## Notes

- The contracts were created from the exact compiler initcode (salt prefix `TacPredict.virtual.v2.`, see `protocol/deployments/virtual-base-mainnet.initcode.json`), so Basescan matches the creation code as well as the runtime code. If it asks for the creation transaction, the addresses and transactions are in `protocol/deployments/virtual-base-mainnet.json`.
- The first set (v1) is deprecated and unused. Do not verify it and do not point anything at it.
- Sourcify accepts the same Standard JSON; it is optional.
