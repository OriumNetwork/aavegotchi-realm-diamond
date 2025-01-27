// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {InstallationDiamondInterface} from "../interfaces/InstallationDiamondInterface.sol";

import {LibAppStorage, AppStorage, Parcel, TokenSplitParams, SplitCalculation, ProfitShare} from "./AppStorage.sol";
import {LibAppStorageInstallation, InstallationAppStorage, InstallationType} from "./AppStorageInstallation.sol";
import "../interfaces/IERC20Mintable.sol";
import "../interfaces/AavegotchiDiamond.sol";
import "../interfaces/IERC7432.sol";
import "contracts/test/ERC20Splitter.sol";
import {IERC721} from "../interfaces/IERC721.sol";

library LibAlchemica {
  uint256 constant bp = 100 ether;
  uint256 constant splitBP = 10000;

  event AlchemicaClaimed(
    uint256 indexed _realmId,
    uint256 indexed _gotchiId,
    uint256 indexed _alchemicaType,
    uint256 _amount,
    uint256 _spilloverRate,
    uint256 _spilloverRadius
  );

  struct TransferAmounts {
    uint256 owner;
    uint256 spill;
  }

  function settleUnclaimedAlchemica(uint256 _tokenId, uint256 _alchemicaType) internal {
    AppStorage storage s = LibAppStorage.diamondStorage();

    //todo: only do this every 8 hrs

    uint256 capacity = calculateTotalCapacity(_tokenId, _alchemicaType);

    uint256 alchemicaSinceUpdate = alchemicaSinceLastUpdate(_tokenId, _alchemicaType);

    if (alchemicaSinceUpdate > 0) {
      //Cannot settle more than capacity
      if (s.parcels[_tokenId].unclaimedAlchemica[_alchemicaType] + alchemicaSinceUpdate > capacity) {
        s.parcels[_tokenId].unclaimedAlchemica[_alchemicaType] = capacity;
      } else {
        //Increment alchemica
        s.parcels[_tokenId].unclaimedAlchemica[_alchemicaType] += alchemicaSinceUpdate;
      }
    }

    s.parcels[_tokenId].lastUpdateTimestamp[_alchemicaType] = block.timestamp;
  }

  function increaseTraits(uint256 _realmId, uint256 _installationId, bool isUpgrade) internal {
    AppStorage storage s = LibAppStorage.diamondStorage();

    //First save the current harvested amount
    InstallationDiamondInterface.InstallationType memory installationType = InstallationDiamondInterface(s.installationsDiamond).getInstallationType(
      _installationId
    );

    uint256 altarPrerequisite = installationType.prerequisites[0];
    uint256 lodgePrerequisite = installationType.prerequisites[1];

    // check altar requirement
    uint256 equippedAltarId = s.parcels[_realmId].altarId;
    uint256 equippedAltarLevel = InstallationDiamondInterface(s.installationsDiamond).getInstallationType(equippedAltarId).level;

    if (altarPrerequisite > 0) {
      require(equippedAltarLevel >= altarPrerequisite, "LibAlchemica: Altar Tech Tree Reqs not met");
    }

    // check lodge requirement
    if (lodgePrerequisite > 0) {
      uint256 equippedLodgeId = s.parcels[_realmId].lodgeId;
      uint256 equippedLodgeLevel = InstallationDiamondInterface(s.installationsDiamond).getInstallationType(equippedLodgeId).level;
      require(equippedLodgeLevel >= lodgePrerequisite, "LibAlchemica: Lodge Tech Tree Reqs not met");
    }

    // check harvester requirement
    if (installationType.installationType == 1) {
      require(s.parcels[_realmId].reservoirs[installationType.alchemicaType].length > 0, "LibAlchemica: Must equip reservoir of type");
    }

    uint256 alchemicaType = installationType.alchemicaType;

    //unclaimed alchemica must be settled before mutating harvestRate and capacity
    if (installationType.harvestRate > 0 || installationType.capacity > 0) {
      settleUnclaimedAlchemica(_realmId, alchemicaType);
    }

    //handle harvester
    if (installationType.harvestRate > 0) {
      s.parcels[_realmId].alchemicaHarvestRate[alchemicaType] += installationType.harvestRate;
      addHarvester(_realmId);
    }

    //reservoir
    if (installationType.capacity > 0) {
      s.parcels[_realmId].reservoirs[alchemicaType].push(_installationId);
    }

    //Altar
    if (installationType.installationType == 0) {
      require(isUpgrade || s.parcels[_realmId].altarId == 0, "LibAlchemica: Cannot equip two altars");
      s.parcels[_realmId].altarId = _installationId;
    }

    // upgradeQueueBoost
    if (installationType.upgradeQueueBoost > 0) {
      s.parcels[_realmId].upgradeQueueCapacity += installationType.upgradeQueueBoost;
    }
    //Bounce Gate
    if (installationType.installationType == 8 && !isUpgrade) {
      require(!s.bounceGates[_realmId].equipped, "LibAlchemica: Bounce Gate already equipped");
      s.bounceGates[_realmId].equipped = true;
    }
  }

  function reduceTraits(uint256 _realmId, uint256 _installationId, bool isUpgrade) internal {
    AppStorage storage s = LibAppStorage.diamondStorage();

    InstallationDiamondInterface installationsDiamond = InstallationDiamondInterface(s.installationsDiamond);
    InstallationDiamondInterface.InstallationType memory installationType = InstallationDiamondInterface(s.installationsDiamond).getInstallationType(
      _installationId
    );
    InstallationDiamondInterface.InstallationIdIO[] memory installationBalances = installationsDiamond.installationBalancesOfToken(
      address(this),
      _realmId
    );

    uint256 alchemicaType = installationType.alchemicaType;

    //unclaimed alchemica must be settled before updating harvestRate and capacity
    if (installationType.harvestRate > 0 || installationType.capacity > 0) {
      settleUnclaimedAlchemica(_realmId, alchemicaType);
    }

    //Decrement harvest variables
    if (installationType.harvestRate > 0) {
      s.parcels[_realmId].alchemicaHarvestRate[alchemicaType] -= installationType.harvestRate;
      s.parcels[_realmId].harvesterCount--;
    }

    //Altar
    if (installationType.installationType == 0 && !isUpgrade) {
      s.parcels[_realmId].altarId = 0;
    }

    // Lodge
    if (installationType.installationType == 3) {
      s.parcels[_realmId].lodgeId = 0;
    }

    //Decrement reservoir variables
    if (installationType.capacity > 0) {
      for (uint256 i; i < s.parcels[_realmId].reservoirs[alchemicaType].length; i++) {
        if (s.parcels[_realmId].reservoirs[alchemicaType][i] == _installationId) {
          popArray(s.parcels[_realmId].reservoirs[alchemicaType], i);
          break;
        }
      }
      if (!isUpgrade && s.parcels[_realmId].unclaimedAlchemica[alchemicaType] > calculateTotalCapacity(_realmId, alchemicaType)) {
        //step 1 - unequip all harvesters
        //step 2 - claim alchemica balance
        //step 3 - unequip reservoir

        revert("LibAlchemica: Claim Alchemica before reducing capacity");
      }
    }
    //Bounce Gate
    if (installationType.installationType == 8 && !isUpgrade) {
      require(s.bounceGates[_realmId].equipped, "LibAlchemica: Bounce Gate not equipped");
      //cannot uninstall a Bounce Gate if an event is ongoing
      if (s.bounceGates[_realmId].startTime > 0) {
        require(s.bounceGates[_realmId].endTime < block.timestamp, "LibAlchemica: Ongoing event, cannot unequip Portal");
      }
      s.bounceGates[_realmId].equipped = false;
    }

    // Reduce upgrade queue boost. Handle underflow exception for bugged parcels
    if (installationType.upgradeQueueBoost > 0 && s.parcels[_realmId].upgradeQueueCapacity >= installationType.upgradeQueueBoost) {
      s.parcels[_realmId].upgradeQueueCapacity -= installationType.upgradeQueueBoost;
    }

    //Verify tech tree requirements for remaining installations
    for (uint256 i; i < installationBalances.length; i++) {
      uint256 installationId = installationBalances[i].installationId;

      // tech tree requirements are checked at the beginning of the upgradeInstallation function, so we can skip them during an upgrade
      if (!isUpgrade) {
        InstallationDiamondInterface.InstallationType memory equippedInstallation = installationsDiamond.getInstallationType(installationId);

        require(
          InstallationDiamondInterface(s.installationsDiamond).getInstallationType(s.parcels[_realmId].altarId).level >=
            equippedInstallation.prerequisites[0],
          "LibAlchemica: Altar Tech Tree Reqs not met"
        );

        // check lodge requirement
        if (equippedInstallation.prerequisites[1] > 0) {
          require(
            InstallationDiamondInterface(s.installationsDiamond).getInstallationType(s.parcels[_realmId].lodgeId).level >=
              equippedInstallation.prerequisites[1],
            "LibAlchemica: Lodge Tech Tree Reqs not met"
          );
        }
      }
    }
  }

  function alchemicaSinceLastUpdate(uint256 _tokenId, uint256 _alchemicaType) internal view returns (uint256) {
    AppStorage storage s = LibAppStorage.diamondStorage();
    uint256 amount = (s.parcels[_tokenId].alchemicaHarvestRate[_alchemicaType] *
      (block.timestamp - s.parcels[_tokenId].lastUpdateTimestamp[_alchemicaType])) / (1 days);

    return amount;
  }

  function addHarvester(uint256 _realmId) internal {
    AppStorage storage s = LibAppStorage.diamondStorage();
    require(addHarvesterAllowed(s.parcels[_realmId].size, s.parcels[_realmId].harvesterCount), "LibAlchemica: Too many harvesters");
    s.parcels[_realmId].harvesterCount++;
  }

  function addHarvesterAllowed(uint256 _realmSize, uint16 _harvesterCount) internal pure returns (bool) {
    if (_realmSize == 0) return _harvesterCount < 4;
    else if (_realmSize == 1) return _harvesterCount < 16;
    else if (_realmSize == 2 || _realmSize == 3) return _harvesterCount < 128;
    else if (_realmSize == 4) return _harvesterCount < 256;
    else return false;
  }

  function calculateTotalCapacity(uint256 _tokenId, uint256 _alchemicaType) internal view returns (uint256 capacity_) {
    AppStorage storage s = LibAppStorage.diamondStorage();
    for (uint256 i; i < s.parcels[_tokenId].reservoirs[_alchemicaType].length; i++) {
      capacity_ += InstallationDiamondInterface(s.installationsDiamond).getReservoirCapacity(s.parcels[_tokenId].reservoirs[_alchemicaType][i]);
    }
  }

  function getAvailableAlchemica(uint256 _realmId, uint256 _alchemicaType) internal view returns (uint256) {
    AppStorage storage s = LibAppStorage.diamondStorage();

    uint256 remaining = s.parcels[_realmId].alchemicaRemaining[_alchemicaType];

    if (remaining == 0) return remaining;

    //First get the onchain amount
    uint256 available = s.parcels[_realmId].unclaimedAlchemica[_alchemicaType];
    //Then get the floating amount
    available += alchemicaSinceLastUpdate(_realmId, _alchemicaType);

    uint256 capacity = calculateTotalCapacity(_realmId, _alchemicaType);

    //ensure that available alchemica is not higher than available reservoir capacity
    return available < capacity ? available : capacity;
  }

  function calculateTransferAmounts(uint256 _amount, uint256 _spilloverRate) internal pure returns (uint256 owner, uint256 spill) {
    owner = (_amount * (bp - (_spilloverRate * 10 ** 16))) / bp;
    spill = (_amount * (_spilloverRate * 10 ** 16)) / bp;
  }

  function calculateSpilloverForReservoir(
    uint256 _realmId,
    uint256 _alchemicaType
  ) internal view returns (uint256 spilloverRate, uint256 spilloverRadius) {
    AppStorage storage s = LibAppStorage.diamondStorage();
    uint256 capacityXspillrate;
    uint256 capacityXspillradius;
    uint256 totalCapacity;
    for (uint256 i; i < s.parcels[_realmId].reservoirs[_alchemicaType].length; i++) {
      InstallationDiamondInterface.ReservoirStats memory reservoirStats = InstallationDiamondInterface(s.installationsDiamond).getReservoirStats(
        s.parcels[_realmId].reservoirs[_alchemicaType][i]
      );
      totalCapacity += reservoirStats.capacity;

      capacityXspillrate += reservoirStats.capacity * reservoirStats.spillRate;
      capacityXspillradius += reservoirStats.capacity * reservoirStats.spillRadius;
    }
    if (totalCapacity == 0) return (0, 0);

    spilloverRate = capacityXspillrate / totalCapacity;
    spilloverRadius = capacityXspillradius / totalCapacity;
  }

  function getAllRoundAlchemica(uint256 _realmId, uint256 _alchemicaType) internal view returns (uint256 alchemica) {
    AppStorage storage s = LibAppStorage.diamondStorage();
    for (uint256 i; i < s.parcels[_realmId].currentRound; i++) {
      alchemica += s.parcels[_realmId].roundAlchemica[i][_alchemicaType];
    }
  }

  function getTotalClaimed(uint256 _realmId, uint256 _alchemicaType) internal view returns (uint256 totalClaimed) {
    AppStorage storage s = LibAppStorage.diamondStorage();
    totalClaimed = getAllRoundAlchemica(_realmId, _alchemicaType) - s.parcels[_realmId].alchemicaRemaining[_alchemicaType];
  }

  function claimAvailableAlchemica(uint256 _realmId, uint256 _gotchiId) internal {
    AppStorage storage s = LibAppStorage.diamondStorage();
    InstallationAppStorage storage si = LibAppStorageInstallation.diamondStorage();

    require(block.timestamp > s.lastClaimedAlchemica[_realmId] + 8 hours, "AlchemicaFacet: 8 hours claim cooldown");
    s.lastClaimedAlchemica[_realmId] = block.timestamp;

    bytes32 roleId = s.actionRightToRole[1];

    for (uint256 i = 0; i < 4; i++) {
      uint256 available = _updateAvailableAlchemica(_realmId, i);

      (uint256 spilloverRate, uint256 spilloverRadius) = calculateSpilloverForReservoir(_realmId, i);
      (uint256 ownerAmount, uint256 spillAmount) = calculateTransferAmounts(available, spilloverRate);

      ProfitShare storage profitShare = s.profitShares[si.realmDiamond][_realmId][roleId];

      if (i < profitShare.tokenAddresses.length && isLandRented(profitShare.tokenAddresses[i], _realmId, roleId)) {
        _distributeRentedAlchemica(_gotchiId, _realmId, available, spilloverRate, profitShare, i);
      } else {
        mintAvailableAlchemica(i, _gotchiId, ownerAmount, spillAmount);
      }

      emit AlchemicaClaimed(_realmId, _gotchiId, i, available, spilloverRate, spilloverRadius);
    }
  }

  function _updateAvailableAlchemica(uint256 _realmId, uint256 _alchemicaType) internal returns (uint256 available) {
    AppStorage storage s = LibAppStorage.diamondStorage();

    uint256 remaining = s.parcels[_realmId].alchemicaRemaining[_alchemicaType];
    available = getAvailableAlchemica(_realmId, _alchemicaType);
    available = remaining < available ? remaining : available;

    s.parcels[_realmId].alchemicaRemaining[_alchemicaType] -= available;
    s.parcels[_realmId].unclaimedAlchemica[_alchemicaType] = 0;
    s.parcels[_realmId].lastUpdateTimestamp[_alchemicaType] = block.timestamp;
  }

  function _distributeRentedAlchemica(
    uint256 _gotchiId,
    uint256 _realmdId,
    uint256 available,
    uint256 spilloverRate,
    ProfitShare storage profitShare,
    uint256 tokenIndex
  ) internal {
    AppStorage storage s = LibAppStorage.diamondStorage();

    SplitCalculation memory splitCalc = _calculateSplit(
      available,
      spilloverRate,
      profitShare.ownerShare[tokenIndex],
      profitShare.borrowerShare[tokenIndex],
      profitShare.recipients,
      profitShare.shares,
      profitShare.tokenAddresses,
      _realmdId
    );

    IERC20Mintable alchemica = IERC20Mintable(s.alchemicaAddresses[tokenIndex]);
    alchemica.mint(alchemicaRecipient(_gotchiId), splitCalc.borrowerAmount);
    alchemica.mint(address(this), splitCalc.remainingAmount);

    ERC20Splitter splitter = ERC20Splitter(s.splitterContractAddress);
    uint256 totalEthAmount = 0;
    for (uint256 i = 0; i < splitCalc.splitTokenAddresses.length; i++) {
      if (splitCalc.splitTokenAddresses[i] == address(0)) {
        totalEthAmount += splitCalc.splitAmounts[i];
      }
    }
    splitter.deposit{value: totalEthAmount}(
      splitCalc.splitTokenAddresses,
      splitCalc.splitAmounts,
      splitCalc.recalculatedShares,
      splitCalc.splitRecipients
    );
  }

  function mintAvailableAlchemica(uint256 _alchemicaType, uint256 _gotchiId, uint256 _ownerAmount, uint256 _spillAmount) internal {
    AppStorage storage s = LibAppStorage.diamondStorage();

    IERC20Mintable alchemica = IERC20Mintable(s.alchemicaAddresses[_alchemicaType]);

    if (_ownerAmount > 0) alchemica.mint(alchemicaRecipient(_gotchiId), _ownerAmount);
    if (_spillAmount > 0) alchemica.mint(address(this), _spillAmount);
  }

  function alchemicaRecipient(uint256 _gotchiId) internal view returns (address) {
    AppStorage storage s = LibAppStorage.diamondStorage();

    AavegotchiDiamond diamond = AavegotchiDiamond(s.aavegotchiDiamond);
    if (diamond.isAavegotchiLent(uint32(_gotchiId))) {
      return diamond.gotchiEscrow(_gotchiId);
    } else {
      return diamond.ownerOf(_gotchiId);
    }
  }

  function popArray(uint256[] storage _array, uint256 _index) internal {
    _array[_index] = _array[_array.length - 1];
    _array.pop();
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
    TokenSplitParams memory params,
    uint256 _realmId
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

    AppStorage storage s = LibAppStorage.diamondStorage();
    InstallationAppStorage storage si = LibAppStorageInstallation.diamondStorage();

    for (uint256 i = 0; i < numTokens; i++) {
      uint256 numRecipients = params.recipients[i].length;
      splitRecipients[i] = new address[](numRecipients + 1);
      recalculatedShares[i] = new uint16[](numRecipients + 1);

      splitRecipients[i][0] = s.erc7432OriginalOwners[si.realmDiamond][_realmId];
      recalculatedShares[i][0] = params.ownerShare;

      uint256 recalculatedShareTotal = params.ownerShare;
      for (uint256 j = 0; j < numRecipients; j++) {
        splitRecipients[i][j + 1] = params.recipients[i][j];
        recalculatedShares[i][j + 1] = params.sharesArray[i][j];
        recalculatedShareTotal += params.sharesArray[i][j];
      }

      // Use recalculatedShareTotal directly to compute recalibrated shares
      uint256 totalRecalculated = 0;
      for (uint256 j = 0; j < recalculatedShares[i].length; j++) {
        uint256 recalculated = (recalculatedShares[i][j] * splitBP * splitBP) / (recalculatedShareTotal * splitBP);
        require(recalculated <= type(uint16).max, "Recalculated share exceeds uint16");

        recalculatedShares[i][j] = uint16(recalculated);
        totalRecalculated += recalculatedShares[i][j];
      }

      uint256 discrepancy = splitBP - totalRecalculated;
      require(discrepancy <= type(uint16).max, "Discrepancy exceeds uint16");

      recalculatedShares[i][0] += uint16(discrepancy);

      splitAmounts[i] = (params.remainingAmount * params.ownerShare) / splitBP;
    }
  }

  function _calculateSplit(
    uint256 _amount,
    uint256 _spilloverRate,
    uint16 ownerShare,
    uint16 borrowerShare,
    address[][] memory recipients,
    uint16[][] memory sharesArray,
    address[] memory tokenAddresses,
    uint256 _realmId
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
      }),
      _realmId
    );
  }

  function _handleTokenChanneling(uint256 _realmId, bytes32 _roleId, uint256 channelAmount, uint256 tokenIndex, uint256 _gotchiId) internal {
    AppStorage storage s = LibAppStorage.diamondStorage();
    InstallationAppStorage storage si = LibAppStorageInstallation.diamondStorage();

    (uint256 rate, ) = InstallationDiamondInterface(s.installationsDiamond).spilloverRateAndRadiusOfId(s.parcels[_realmId].altarId);
    ProfitShare storage profitShare = s.profitShares[si.realmDiamond][_realmId][_roleId];

    IERC20Mintable alchemica = IERC20Mintable(s.alchemicaAddresses[tokenIndex]);

    if (alchemica.balanceOf(address(this)) < s.greatPortalCapacity[tokenIndex]) {
      (uint256 ownerAmount, uint256 spillAmount) = calculateTransferAmounts(channelAmount, rate);

      if (isLandRented(profitShare.tokenAddresses[tokenIndex], _realmId, _roleId)) {
        _handleRentedLandChanneling(alchemica, _gotchiId, _realmId, channelAmount, rate, profitShare, tokenIndex);
      } else {
        alchemica.mint(LibAlchemica.alchemicaRecipient(_gotchiId), ownerAmount);
        alchemica.mint(address(this), spillAmount);
      }
    } else {
      if (isLandRented(profitShare.tokenAddresses[tokenIndex], _realmId, _roleId)) {
        _handleRentedLandChanneling(alchemica, _gotchiId, _realmId, channelAmount, rate, profitShare, tokenIndex);
      } else {
        (uint256 ownerAmount, ) = calculateTransferAmounts(channelAmount, rate);
        alchemica.transfer(LibAlchemica.alchemicaRecipient(_gotchiId), ownerAmount);
      }
    }
  }

  function _handleRentedLandChanneling(
    IERC20Mintable alchemica,
    uint256 _gotchiId,
    uint256 _realmId,
    uint256 channelAmount,
    uint256 rate,
    ProfitShare storage profitShare,
    uint256 tokenIndex
  ) internal {
    AppStorage storage s = LibAppStorage.diamondStorage();
    SplitCalculation memory splitCalc = _calculateSplit(
      channelAmount,
      rate,
      profitShare.ownerShare[tokenIndex],
      profitShare.borrowerShare[tokenIndex],
      profitShare.recipients,
      profitShare.shares,
      profitShare.tokenAddresses,
      _realmId
    );

    alchemica.mint(LibAlchemica.alchemicaRecipient(_gotchiId), splitCalc.borrowerAmount);
    alchemica.mint(address(this), splitCalc.remainingAmount);

    ERC20Splitter splitter = ERC20Splitter(s.splitterContractAddress);

    splitter.deposit(splitCalc.splitTokenAddresses, splitCalc.splitAmounts, splitCalc.recalculatedShares, splitCalc.splitRecipients);
  }

  /**
   * @notice Checks if a specific role is active (not expired).
   * @param _tokenAddress The address of the token associated with the role.
   * @param _tokenId The ID of the token associated with the role.
   * @param _roleId The ID of the role to check.
   * @return isActive True if the role is active, false otherwise.
   */
  function isLandRented(address _tokenAddress, uint256 _tokenId, bytes32 _roleId) internal view returns (bool isActive) {
    AppStorage storage s = LibAppStorage.diamondStorage();
    IERC7432 rolesRegistry = IERC7432(s.parcelRolesRegistryFacetAddress);
    uint64 expirationDate = rolesRegistry.roleExpirationDate(_tokenAddress, _tokenId, _roleId);

    return expirationDate > block.timestamp;
  }
}
