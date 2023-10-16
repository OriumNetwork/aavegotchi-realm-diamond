// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {LibAppStorage, AppStorage} from "./AppStorage.sol";
import {IERC7432, RoleData} from "../interfaces/IERC7432.sol";
import {AavegotchiDiamond} from "../interfaces/AavegotchiDiamond.sol";

library LibGotchiRoles {
  bytes32 public constant GOTCHIVERSE_PLAYER = keccak256("GOTCHIVERSE_PLAYER");

  function isAavegotchiLent(uint32 _gotchiId) internal view returns (bool) {
    AppStorage storage s = LibAppStorage.diamondStorage();
    address _gotchiOwner = AavegotchiDiamond(s.aavegotchiDiamond).ownerOf(_gotchiId);
    address _lastGrantee = IERC7432(s.rolesRegistry).lastGrantee(GOTCHIVERSE_PLAYER, s.aavegotchiDiamond, _gotchiId, _gotchiOwner);
    return isAavegotchiPlayer(_gotchiId, _lastGrantee);
  }

  function isAavegotchiPlayer(uint32 _gotchiId, address _player) public view returns (bool) {
    AppStorage storage s = LibAppStorage.diamondStorage();
    return IERC7432(s.rolesRegistry).hasRole(GOTCHIVERSE_PLAYER, address(this), _gotchiId, address(0), _player);
  }

  function getAmountFromPercentage(uint256 _amount, uint256 _percentage) public pure returns (uint256) {
    return (_amount * _percentage) / 100 ether;
  }
}
