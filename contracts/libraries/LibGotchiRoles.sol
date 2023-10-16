// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {LibAppStorage, AppStorage} from "./AppStorage.sol";
import {IERC7432, RoleData} from "../interfaces/IERC7432.sol";
import {AavegotchiDiamond} from "../interfaces/AavegotchiDiamond.sol";

library LibGotchiRoles {
  function isAavegotchiLent(uint32 _tokenId) internal view returns (bool) {
    AppStorage storage s = LibAppStorage.diamondStorage();
    address _gotchiOwner = AavegotchiDiamond(s.aavegotchiDiamond).ownerOf(_tokenId);
    address _lastGrantee = IERC7432(s.rolesRegistry).lastGrantee(keccak256("USER_ROLE"), s.aavegotchiDiamond, _tokenId, _gotchiOwner);

    return IERC7432(s.rolesRegistry).hasRole(keccak256("USER_ROLE"), address(this), _tokenId, address(0), _lastGrantee);
  }



  function getAmountFromPercentage(uint256 _amount, uint256 _percentage) public pure returns (uint256) {
    return (_amount * _percentage) / 100 ether;
  }
}
