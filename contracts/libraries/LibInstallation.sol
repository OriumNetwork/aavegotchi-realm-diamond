// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {LibERC998} from "../libraries/LibERC998.sol";
import {LibERC1155} from "../libraries/LibERC1155.sol";
import {LibAppStorageInstallation, InstallationAppStorage} from "../libraries/AppStorageInstallation.sol";

library LibInstallation {
  event TransferToParent(address indexed _toContract, uint256 indexed _toTokenId, uint256 indexed _tokenTypeId, uint256 _value);

  function _equipInstallation(
    address _owner,
    uint256 _realmId,
    uint256 _installationId
  ) internal {
    InstallationAppStorage storage s = LibAppStorageInstallation.diamondStorage();
    LibERC998.removeFromOwner(_owner, _installationId, 1);
    LibERC998.addToParent(s.realmDiamond, _realmId, _installationId, 1);
    emit TransferToParent(s.realmDiamond, _realmId, _installationId, 1);
  }

  function _unequipInstallation(
    address _owner,
    uint256 _realmId,
    uint256 _installationId
  ) internal {
    InstallationAppStorage storage s = LibAppStorageInstallation.diamondStorage();
    LibERC998.removeFromParent(s.realmDiamond, _realmId, _installationId, 1);
    LibERC998.addToOwner(_owner, _installationId, 1);
    LibERC1155._burn(_owner, _installationId, 1);
  }
}
