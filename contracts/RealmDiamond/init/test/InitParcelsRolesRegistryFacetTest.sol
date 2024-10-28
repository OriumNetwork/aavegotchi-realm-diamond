// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {LibDiamond} from "../../../libraries/LibDiamond.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC7432} from "../../../interfaces/IERC7432.sol";
import {LibAppStorageInstallation, InstallationAppStorage} from "../../../libraries/AppStorageInstallation.sol";
import {LibAppStorage, AppStorage} from "../../../libraries/AppStorage.sol";

contract InitParcelsRolesRegistryFacetTest {
    AppStorage internal s;
     
    function init(address _realmDiamond, address _parcelRegistry, uint256 _realmdId, address _owner, address _splitterContract) public {
        // Initialize Diamond Storage
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();

        ds.supportedInterfaces[type(IERC7432).interfaceId] = true;
        ds.supportedInterfaces[type(IERC721Receiver).interfaceId] = true;

        // Initialize valid roles in AppStorage
        bytes32[7] memory initialRoles = [
            keccak256("AlchemicaChanneling()"),       // 0: Channeling
            keccak256("EmptyReservoir()"),            // 1: Empty Reservoir
            keccak256("EquipInstallations()"),        // 2: Equip Installations
            keccak256("EquipTiles()"),                // 3: Equip Tiles
            keccak256("UnequipInstallations()"),      // 4: Unequip Installations
            keccak256("UnequipTiles()"),              // 5: Unequip Tiles
            keccak256("UpgradeInstallations()")       // 6: Upgrade Installations
       ];

        for (uint256 i = 0; i < initialRoles.length; i++) {
            s.validRoles[initialRoles[i]] = true;
            s.actionRightToRole[i] = initialRoles[i];  // Map actionRight index to role ID
        }

        // Set realmDiamond in InstallationAppStorage
        InstallationAppStorage storage si = LibAppStorageInstallation.diamondStorage();  // Directly access InstallationAppStorage
        si.realmDiamond = _realmDiamond;
        s.parcelRolesRegistryFacetAddress = _parcelRegistry;
        s.splitterContractAddress = _splitterContract;

        s.parcels[_realmdId].owner = _owner;
    
    }
}
