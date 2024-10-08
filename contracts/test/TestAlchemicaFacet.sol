// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import "../libraries/AppStorage.sol";
import "../libraries/LibRealm.sol";
import "../libraries/LibMeta.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "../libraries/LibAlchemica.sol";
import "../libraries/LibSignature.sol";
import "contracts/test/ERC20Splitter.sol";

uint256 constant bp = 100 ether;

contract TestAlchemicaFacet is Modifiers {

  uint256 private _tempGotchiId;
  address erc20SplitterAddress;
  event ChannelAlchemica(
    uint256 indexed _realmId,
    uint256 indexed _gotchiId,
    uint256[4] _alchemica,
    uint256 _spilloverRate,
    uint256 _spilloverRadius
  );

  struct TransferAmounts {
    uint256 owner;
    uint256 spill;
  }

  struct RoleData {
  address recipient;
  uint64 expirationDate;
  bool revocable;
}

struct ProfitShare {
  uint16[] ownerShare;
  uint16[] borrowerShare;
  address[] tokenAddresses;
  uint16[][] shares;
  address[][] recipients;
}

struct SplitCalculation {
  uint256 ownerAmount;
  uint256 borrowerAmount;
  uint256 remainingAmount;
  address[][] splitRecipients;
  uint16[][] recalculatedShares;
  uint256[] splitAmounts;
  address[] splitTokenAddresses;
}

struct TokenSplitParams {
  uint256 remainingAmount;
  address[][] recipients;
  uint16[][] sharesArray;
  address[] tokenAddresses;
  uint16 ownerShare;
  uint16 borrowerShare;
}


  /// @notice Allow a parcel owner to channel alchemica
  /// @dev This transfers alchemica to the parent ERC721 token with id _gotchiId and also to the great portal
  /// @param _realmId Identifier of parcel where alchemica is being channeled from
  /// @param _gotchiId Identifier of parent ERC721 aavegotchi which alchemica is channeled to
  /// @param _lastChanneled The last time alchemica was channeled in this _realmId

  function mockChannelAlchemica(uint256 _realmId, uint256 _gotchiId, uint256 _lastChanneled) external gameActive {
    AavegotchiDiamond diamond = AavegotchiDiamond(s.aavegotchiDiamond);

    //gotchi CANNOT have active listing for lending
    require(
      !diamond.isAavegotchiListed(uint32(_gotchiId)) || diamond.isAavegotchiLent(uint32(_gotchiId)),
      "AavegotchiDiamond: Gotchi CANNOT have active listing for lending"
    );

    //finally interact while reducing kinship
    diamond.reduceKinshipViaChanneling(uint32(_gotchiId));

    //0 - alchemical channeling
    LibRealm.verifyAccessRight(_realmId, _gotchiId, 0, LibMeta.msgSender());

    require(_lastChanneled == s.gotchiChannelings[_gotchiId], "AlchemicaFacet: Incorrect last duration");

    //Gotchis can only channel every 24 hrs
    if (s.lastChanneledDay[_gotchiId] == block.timestamp / (60 * 60 * 24)) revert("AlchemicaFacet: Gotchi can't channel yet");
    s.lastChanneledDay[_gotchiId] = block.timestamp / (60 * 60 * 24);

    uint256 altarLevel = InstallationDiamondInterface(s.installationsDiamond).getAltarLevel(s.parcels[_realmId].altarId);

    require(altarLevel > 0, "AlchemicaFacet: Must equip Altar");

    //How often Altars can channel depends on their level
    require(block.timestamp >= s.parcelChannelings[_realmId] + s.channelingLimits[altarLevel], "AlchemicaFacet: Parcel can't channel yet");

    (uint256 rate, uint256 radius) = InstallationDiamondInterface(s.installationsDiamond).spilloverRateAndRadiusOfId(s.parcels[_realmId].altarId);

    require(rate > 0, "InstallationFacet: Spillover Rate cannot be 0");

    uint256[4] memory channelAmounts = [uint256(20e18), uint256(10e18), uint256(5e18), uint256(2e18)];
    // apply kinship modifier
    uint256 kinship = diamond.kinship(_gotchiId) * 10000;
    for (uint256 i; i < 4; i++) {
      uint256 kinshipModifier = floorSqrt(kinship / 50);
      channelAmounts[i] = (channelAmounts[i] * kinshipModifier) / 100;
    }

    for (uint256 i; i < channelAmounts.length; i++) {
      IERC20Mintable alchemica = IERC20Mintable(s.alchemicaAddresses[i]);

      //Mint new tokens if the Great Portal Balance is less than capacity

      if (alchemica.balanceOf(address(this)) < s.greatPortalCapacity[i]) {
        TransferAmounts memory amounts = calculateTransferAmounts(channelAmounts[i], rate);

        alchemica.mint(LibAlchemica.alchemicaRecipient(_gotchiId), amounts.owner);
        alchemica.mint(address(this), amounts.spill);
      } else {
        TransferAmounts memory amounts = calculateTransferAmounts(channelAmounts[i], rate);

        alchemica.transfer(LibAlchemica.alchemicaRecipient(_gotchiId), amounts.owner);
      }
    }

    //update latest channeling
    s.gotchiChannelings[_gotchiId] = block.timestamp;
    s.parcelChannelings[_realmId] = block.timestamp;
    emit ChannelAlchemica(_realmId, _gotchiId, channelAmounts, rate, radius);
  }

  /// @notice Calculate the floor square root of a number
  /// @param n Input number
  function floorSqrt(uint256 n) internal pure returns (uint256) {
    unchecked {
      if (n > 0) {
        uint256 x = n / 2 + 1;
        uint256 y = (x + n / x) / 2;
        while (x > y) {
          x = y;
          y = (x + n / x) / 2;
        }
        return x;
      }
      return 0;
    }
  }

  function calculateTransferAmounts(uint256 _amount, uint256 _spilloverRate) internal pure returns (TransferAmounts memory) {
    uint256 owner = (_amount * (bp - (_spilloverRate * 10 ** 16))) / bp;
    uint256 spill = (_amount * (_spilloverRate * 10 ** 16)) / bp;
    return TransferAmounts(owner, spill);
  }

  function _calculateAmounts(
    uint256 _amount,
    uint256 _spilloverRate,
    uint16 ownerShare,
    uint16 borrowerShare
  ) internal pure returns (uint256 borrowerAmount, uint256 ownerAmount, uint256 remainingAmount) {
    uint256 totalAmount = (_amount * (bp - (_spilloverRate * 1e16))) / bp;
    borrowerAmount = (totalAmount * borrowerShare) / bp;
    ownerAmount = (totalAmount * ownerShare) / bp;
    remainingAmount = totalAmount - ownerAmount - borrowerAmount;
  }

  function _calculateTokenSplits(
    TokenSplitParams memory params
  )
    internal
    view
    returns (
      address[][] memory splitRecipients,
      uint16[][] memory recalculatedShares,
      uint256[] memory splitAmounts,
      address[] memory splitTokenAddresses
    )
  {
    uint256 numTokens = params.tokenAddresses.length;
    splitRecipients = new address[][](numTokens);
    recalculatedShares = new uint16[][](numTokens);
    splitAmounts = new uint256[](numTokens);
    splitTokenAddresses = params.tokenAddresses;

    for (uint256 i = 0; i < numTokens; i++) {
      uint256 numRecipients = params.recipients[i].length;
      splitRecipients[i] = new address[](numRecipients + 1);
      recalculatedShares[i] = new uint16[](numRecipients + 1);

      splitRecipients[i][0] = address(this);
      recalculatedShares[i][0] = params.ownerShare;

      uint256 recalculatedShareTotal = params.ownerShare;

      for (uint256 j = 0; j < numRecipients; j++) {
        splitRecipients[i][j + 1] = params.recipients[i][j];
        recalculatedShares[i][j + 1] = params.sharesArray[i][j];
        recalculatedShareTotal += params.sharesArray[i][j];
      }

      uint256 recalibrationFactor = ((bp - params.borrowerShare) * bp) / recalculatedShareTotal;

      uint16 totalRecalculated = 0;
      for (uint256 j = 0; j < recalculatedShares[i].length; j++) {
        recalculatedShares[i][j] = uint16((recalculatedShares[i][j] * recalibrationFactor) / bp);
        totalRecalculated += recalculatedShares[i][j];
      }

      recalculatedShares[i][0] += uint16((bp - params.borrowerShare) - totalRecalculated);

      splitAmounts[i] = (params.remainingAmount * params.ownerShare) / bp;
    }
  }

  function _calculateSplit(
    uint256 _amount,
    uint256 _spilloverRate,
    uint16 ownerShare,
    uint16 borrowerShare,
    address[][] memory recipients,
    uint16[][] memory sharesArray,
    address[] memory tokenAddresses
  ) internal view returns (SplitCalculation memory splitCalc) {
    (uint256 borrowerAmount, uint256 ownerAmount, uint256 remainingAmount) = _calculateAmounts(_amount, _spilloverRate, ownerShare, borrowerShare);

    splitCalc.borrowerAmount = borrowerAmount;
    splitCalc.ownerAmount = ownerAmount;
    splitCalc.remainingAmount = remainingAmount;

    (splitCalc.splitRecipients, splitCalc.recalculatedShares, splitCalc.splitAmounts, splitCalc.splitTokenAddresses) = _calculateTokenSplits(
      TokenSplitParams({
        remainingAmount: remainingAmount,
        recipients: recipients,
        sharesArray: sharesArray,
        tokenAddresses: tokenAddresses,
        ownerShare: ownerShare,
        borrowerShare: borrowerShare
      })
    );
  }

  // function _handleTokenChanneling(uint256 _realmId, bytes32 _roleId, uint256 channelAmount, uint256 tokenIndex) internal {
  //   InstallationAppStorage storage si = LibAppStorageInstallation.diamondStorage();
  //   (uint256 rate, ) = InstallationDiamondInterface(s.installationsDiamond).spilloverRateAndRadiusOfId(s.parcels[_realmId].altarId);
  //   ProfitShare storage profitShare = s.profitShares[si.realmDiamond][_realmId][_roleId];
  //   uint256 _gotchiId = _tempGotchiId;

  //   IERC20Mintable alchemica = IERC20Mintable(profitShare.tokenAddresses[tokenIndex]);

  //   if (alchemica.balanceOf(address(this)) < s.greatPortalCapacity[tokenIndex]) {
  //     TransferAmounts memory amounts = calculateTransferAmounts(channelAmount, rate);

  //     if (isLandRented(profitShare.tokenAddresses[tokenIndex], _realmId, _roleId)) {
  //       _handleRentedLandChanneling(alchemica, _gotchiId, channelAmount, rate, profitShare, tokenIndex);
  //     } else {
  //       alchemica.mint(LibAlchemica.alchemicaRecipient(_gotchiId), amounts.owner);
  //       alchemica.mint(address(this), amounts.spill);
  //     }
  //   } else {
  //     TransferAmounts memory amounts = calculateTransferAmounts(channelAmount, rate);
  //     alchemica.transfer(LibAlchemica.alchemicaRecipient(_gotchiId), amounts.owner);
  //   }
  // }

  function _handleRentedLandChanneling(
    IERC20Mintable alchemica,
    uint256 _gotchiId,
    uint256 channelAmount,
    uint256 rate,
    ProfitShare storage profitShare,
    uint256 tokenIndex
  ) internal {
    SplitCalculation memory splitCalc = _calculateSplit(
      channelAmount,
      rate,
      profitShare.ownerShare[tokenIndex],
      profitShare.borrowerShare[tokenIndex],
      profitShare.recipients,
      profitShare.shares,
      profitShare.tokenAddresses
    );

    alchemica.mint(LibAlchemica.alchemicaRecipient(_gotchiId), splitCalc.borrowerAmount);
    alchemica.mint(address(this), splitCalc.remainingAmount);

    ERC20Splitter splitter = ERC20Splitter(erc20SplitterAddress);
    splitter.deposit(splitCalc.splitTokenAddresses, splitCalc.splitAmounts, splitCalc.recalculatedShares, splitCalc.splitRecipients);
  }

  /**
   * @notice Checks if a specific role is active (not expired).
   * @param _tokenAddress The address of the token associated with the role.
   * @param _tokenId The ID of the token associated with the role.
   * @param _roleId The ID of the role to check.
   * @return isActive True if the role is active, false otherwise.
   */
  function isLandRented(address _tokenAddress, uint256 _tokenId, bytes32 _roleId) public view returns (bool isActive) {
    IERC7432 rolesRegistry = IERC7432(s.parcelRolesRegistryFacetAddress);
    uint64 expirationDate = rolesRegistry.roleExpirationDate(_tokenAddress, _tokenId, _roleId);
    return expirationDate > block.timestamp;
  }
}
