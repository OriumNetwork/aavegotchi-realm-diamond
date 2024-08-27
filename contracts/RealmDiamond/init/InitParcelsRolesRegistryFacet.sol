// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {LibDiamond} from "../../libraries/LibDiamond.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC7432} from "../../interfaces/IERC7432.sol";
import {LibAppStorage, AppStorage} from "../../libraries/AppStorage.sol";

contract InitParcelsRolesRegistryFacet {
     AppStorage internal s;
     
    function init() public {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();

        ds.supportedInterfaces[type(IERC7432).interfaceId] = true;
        ds.supportedInterfaces[type(IERC721Receiver).interfaceId] = true;

          bytes32[5] memory initialRoles = [
            keccak256("AlchemicaChanneling()"),
            keccak256("EmptyReservoir()"),
            keccak256("EquipInstallations()"),
            keccak256("EquipTiles()"),
            keccak256("UpgradeInstallations()")
        ];

        for (uint256 i = 0; i < initialRoles.length; i++) {
            s.validRoles[initialRoles[i]] = true;
            s.allowedRoles.push(initialRoles[i]);
        }

         s.parcelRolesRegistryFacet = address(this);
    }
}
