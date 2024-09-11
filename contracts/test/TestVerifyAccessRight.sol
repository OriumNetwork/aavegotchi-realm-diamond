// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {LibRealm} from "../libraries/LibRealm.sol";
import {AppStorage} from "../libraries/AppStorage.sol";
import {IERC7432} from "../interfaces/IERC7432.sol";

contract TestVerifyAccessRight {
    AppStorage internal s;

    function testVerifyAccessRight(
        uint256 _realmId,
        uint256 _gotchiId,
        uint256 _actionRight,
        address _sender
    ) external view {
        LibRealm.verifyAccessRight(_realmId, _gotchiId, _actionRight, _sender);
    }

    function setAccessRight(uint256 _realmId, uint256 _actionRight, uint256 _accessRight) external {
        s.accessRights[_realmId][_actionRight] = _accessRight;
    }

    function setParcelOwner(uint256 _realmId, address _owner) external {
        s.parcels[_realmId].owner = _owner;
    }

    function setRolesRegistryAddress(address _rolesRegistry) external {
        s.parcelRolesRegistryFacetAddress = _rolesRegistry;
    }
}
