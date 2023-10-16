// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

library LibRealmRoles {
  function getActionRightRole(uint256 _actionRight) public pure returns (bytes32) {
    if (_actionRight == 0) return keccak256("CHANNELING_ROLE");
    if (_actionRight == 1) return keccak256("EMPTY_RESERVOIR_ROLE");
    if (_actionRight == 2 || _actionRight == 4) return keccak256("INSTALLATIONS_ROLE");
    if (_actionRight == 3 || _actionRight == 5) return keccak256("TILES_ROLE");
    if (_actionRight == 6) return keccak256("UPGRADE_INSTALLATIONS_ROLE");
    revert("LibRealm: Invalid action right");
  }
}
