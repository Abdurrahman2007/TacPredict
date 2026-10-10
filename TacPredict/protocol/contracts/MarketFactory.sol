// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
contract MarketFactory is AccessControl {
    bytes32 public constant MARKET_CREATOR_ROLE = keccak256("MARKET_CREATOR_ROLE");
    MarketRegistry public immutable registry; address public immutable oracle;
    mapping(bytes32 => bool) public usedSalts;
    struct Terms { bytes32 salt; bytes32 metadataHash; bytes32 rulesHash; bytes32 sourceHash; uint8 outcomes; uint64 openAt; uint64 closeAt; uint64 resolveAfter; uint64 resolutionDeadline; }
    event MetadataPublished(uint256 indexed marketId, string metadataURI, bytes32 metadataHash);
    constructor(address admin, MarketRegistry registry_, address oracle_) {
        require(admin != address(0) && address(registry_).code.length > 0 && oracle_.code.length > 0, "Bad deployment");
        registry = registry_; oracle = oracle_; _grantRole(DEFAULT_ADMIN_ROLE, admin); _grantRole(MARKET_CREATOR_ROLE, admin);
    }
    function createMarket(Terms calldata t, string calldata metadataURI) external onlyRole(MARKET_CREATOR_ROLE) returns (uint256 id) {
        require(!usedSalts[t.salt] && t.salt != 0 && bytes(metadataURI).length > 0, "Invalid salt/URI"); usedSalts[t.salt] = true;
        bytes32 questionId = keccak256(abi.encode(block.chainid, address(this), t.salt, t.metadataHash, t.rulesHash, t.sourceHash, t.closeAt));
        id = registry.create(questionId, t.metadataHash, t.rulesHash, t.sourceHash, oracle, t.outcomes, t.openAt, t.closeAt, t.resolveAfter, t.resolutionDeadline);
        emit MetadataPublished(id, metadataURI, t.metadataHash);
    }
}
