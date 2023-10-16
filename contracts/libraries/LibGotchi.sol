// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {LibAppStorage, AppStorage} from "./AppStorage.sol";
import {IERC7432} from "../interfaces/IERC7432.sol";

library LibGotchi {
  function isAavegotchiLent(uint32 _tokenId) internal view returns (bool) {
    AppStorage storage s = LibAppStorage.diamondStorage();
    address _lastGrantee = IERC7432(s.rolesRegistry).lastGrantee(keccak256("USER_ROLE"), address(this), _tokenId, address(0));

    return IERC7432(s.rolesRegistry).hasRole(keccak256("USER_ROLE"), address(this), _tokenId, address(0), _lastGrantee);
  }
}
