// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {LibDiamond} from "../../../libraries/LibDiamond.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC7432} from "../../../interfaces/IERC7432.sol";
import {LibAppStorageInstallation, InstallationAppStorage} from "../../../libraries/AppStorageInstallation.sol";
import {LibAppStorage, AppStorage} from "../../../libraries/AppStorage.sol";

contract InitParcelsRolesRegistryFacetTest {
    AppStorage internal s;

     
    function init(address _realmDiamond) public {
        // Initialize Diamond Storage
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();

        ds.supportedInterfaces[type(IERC7432).interfaceId] = true;
        ds.supportedInterfaces[type(IERC721Receiver).interfaceId] = true;

        // Initialize valid roles in AppStorage
        bytes32[5] memory initialRoles = [
            keccak256("AlchemicaChanneling()"),
            keccak256("EmptyReservoir()"),
            keccak256("EquipInstallations()"),
            keccak256("EquipTiles()"),
            keccak256("UpgradeInstallations()")
        ];

        for (uint256 i = 0; i < initialRoles.length; i++) {
            s.validRoles[initialRoles[i]] = true;
        }

        // Set realmDiamond in InstallationAppStorage
        InstallationAppStorage storage si = LibAppStorageInstallation.diamondStorage();  // Directly access InstallationAppStorage
        si.realmDiamond = _realmDiamond;
    }
}
