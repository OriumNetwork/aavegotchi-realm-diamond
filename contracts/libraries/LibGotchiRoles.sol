// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {LibAppStorage, AppStorage, ProfitSplit} from "./AppStorage.sol";
import {LibMeta} from "./LibMeta.sol";
import {IERC7432, RoleData} from "../interfaces/IERC7432.sol";
import {IERC20Mintable} from "../interfaces/IERC20Mintable.sol";
import {AavegotchiDiamond} from "../interfaces/AavegotchiDiamond.sol";

library LibGotchiRoles {
  bytes32 public constant GOTCHIVERSE_PLAYER = keccak256("GOTCHIVERSE_PLAYER");

  function isAavegotchiLent(uint32 _gotchiId) internal view returns (bool) {
    AppStorage storage s = LibAppStorage.diamondStorage();
    address _gotchiOwner = AavegotchiDiamond(s.aavegotchiDiamond).ownerOf(_gotchiId);
    address _lastGrantee = IERC7432(s.rolesRegistry).lastGrantee(GOTCHIVERSE_PLAYER, s.aavegotchiDiamond, _gotchiId, _gotchiOwner);
    return hasGotchiversePlayerRole(_gotchiId, _lastGrantee);
  }

  function hasGotchiversePlayerRole(uint32 _gotchiId, address _player) public view returns (bool) {
    AppStorage storage s = LibAppStorage.diamondStorage();
    return IERC7432(s.rolesRegistry).hasRole(GOTCHIVERSE_PLAYER, address(this), _gotchiId, address(0), _player);
  }

  function getAmountFromPercentage(uint256 _amount, uint256 _percentage) public pure returns (uint256) {
    return (_amount * _percentage) / 100 ether;
  }

  function getDecodedGotchiUserRoleData(
    uint256 _gotchiId,
    address _grantee
  ) public returns (bool canChannelAlchemica, ProfitSplit memory profitSplit, address thirdParty) {
    AppStorage storage s = LibAppStorage.diamondStorage();
    address _grantor = AavegotchiDiamond(s.aavegotchiDiamond).ownerOf(_gotchiId);

    RoleData memory _roleData = IERC7432(s.rolesRegistry).roleData(
      LibGotchiRoles.GOTCHIVERSE_PLAYER,
      s.aavegotchiDiamond,
      _gotchiId,
      _grantor,
      _grantee
    );

    // Checking if the roleData is valid
    (bool success, ) = address(this).call(abi.encodeWithSignature("decodeData(uint256)", _roleData.data));

    if (success) {
      return decodeData(_roleData.data);
    } else {
      // if decoding fails, return default values
      return (true, ProfitSplit(100 ether, 0, 0), address(0));
    }
  }

  function decodeData(bytes memory _data) public pure returns (bool, ProfitSplit memory, address) {
    return abi.decode(_data, (bool, ProfitSplit, address));
  }

  function batchTransferRentalAlchemica(
    IERC20Mintable _alchemica,
    uint256 _gotchiId,
    uint256 _amount,
    address _gotchiOwner,
    bool _isMint,
    bool _isChannelAlchemica
  ) public {
    (bool _canChannelAlchemica, ProfitSplit memory _profitSplit, address _thirdParty) = getDecodedGotchiUserRoleData(_gotchiId, LibMeta.msgSender());

    if (_isChannelAlchemica) {
      require(_canChannelAlchemica, "LibAlchemica: Gotchi cannot channel Alchemica");
    }

    if (_profitSplit.lender > 0) {
      uint256 _lenderAmount = getAmountFromPercentage(_amount, _profitSplit.lender);
      transferAlchemica(_alchemica, _gotchiOwner, _lenderAmount, _isMint);
    }

    if (_profitSplit.borrower > 0) {
      uint256 _borrowerAmount = getAmountFromPercentage(_amount, _profitSplit.borrower);
      transferAlchemica(_alchemica, LibMeta.msgSender(), _borrowerAmount, _isMint);
    }

    if (_profitSplit.thirdParty > 0) {
      uint256 _thirdPartyAmount = getAmountFromPercentage(_amount, _profitSplit.thirdParty);
      transferAlchemica(_alchemica, _thirdParty, _thirdPartyAmount, _isMint);
    }
  }

  function transferAlchemica(IERC20Mintable _alchemica, address _to, uint256 _amount, bool _isMint) public {
    if (_isMint) {
      _alchemica.mint(_to, _amount);
    } else {
      _alchemica.transfer(_to, _amount);
    }
  }

  function getActionRightRole(uint256 _actionRight) public pure returns (bytes32) {
    if (_actionRight == 0) return keccak256("CHANNELING_ROLE");
    if (_actionRight == 1) return keccak256("EMPTY_RESERVOIR_ROLE");
    if (_actionRight == 2 || _actionRight == 4) return keccak256("INSTALLATIONS_ROLE");
    if (_actionRight == 3 || _actionRight == 5) return keccak256("TILES_ROLE");
    if (_actionRight == 6) return keccak256("UPGRADE_INSTALLATIONS_ROLE");
    revert("LibRealm: Invalid action right");
  }
}
