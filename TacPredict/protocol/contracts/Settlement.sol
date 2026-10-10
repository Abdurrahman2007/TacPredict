// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {MarketRegistry} from "./MarketRegistry.sol";
import {ConditionalPositions} from "./ConditionalPositions.sol";
contract Settlement {
    MarketRegistry public immutable registry; ConditionalPositions public immutable positions;
    constructor(MarketRegistry r, ConditionalPositions p) { require(address(p.registry()) == address(r), "Registry mismatch"); registry = r; positions = p; }
    function claim(uint256 marketId) external returns (uint256) { return positions.redeemFor(marketId, msg.sender); }
    function refund(uint256 marketId) external returns (uint256) {
        MarketRegistry.Status status = registry.getMarket(marketId).status;
        if (status != MarketRegistry.Status.VOID) registry.timeoutVoid(marketId);
        return positions.redeemFor(marketId, msg.sender);
    }
    function claimable(uint256 marketId, address account) external view returns (uint256) { return positions.claimable(marketId, account); }
}
