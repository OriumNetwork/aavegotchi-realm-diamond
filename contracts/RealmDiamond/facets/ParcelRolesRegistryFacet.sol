// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {IERC7432} from "../../interfaces/IERC7432.sol";
import {IERC721} from "../../interfaces/IERC721.sol";

import {Modifiers, RoleData} from "../../libraries/AppStorage.sol";

import {LibAppStorageInstallation, InstallationAppStorage} from "../../libraries/AppStorageInstallation.sol";

import {LibItems} from "../../libraries/LibItems.sol";
import {LibMeta} from "../../libraries/LibMeta.sol";

contract ParcelRolesRegistryFacet is Modifiers, IERC7432 {
  uint256 public constant MAX_EXPIRATION_DATE = 90 days;
  uint256 constant MAX_SHARES_LENGTH = 100;

  /** Modifiers **/

  modifier onlyRealm(address _tokenAddress) {
    InstallationAppStorage storage si = LibAppStorageInstallation.diamondStorage(); // Directly access InstallationAppStorage
    require(_tokenAddress == si.realmDiamond, "ParcelRolesRegistryFacet: Only Item NFTs are supported");
    _;
  }

  modifier onlyValidRole(bytes32 _roleId) {
    require(s.validRoles[_roleId], "ParcelRolesRegistryFacet: invalid role ID");
    _;
  }

  /** External Functions **/

  function grantRole(Role calldata _role) external override onlyValidRole(_role.roleId) onlyRealm(_role.tokenAddress) {
    require(_role.expirationDate > block.timestamp, "ParcelRolesRegistryFacet: expiration date must be in the future");

    // Deposit NFT if necessary and get the original owner
    address _originalOwner = _depositNft(_role.tokenAddress, _role.tokenId);

    // Get role data from storage
    RoleData storage _roleData = s.erc7432_roles[_role.tokenAddress][_role.tokenId][_role.roleId];

    // Check if the role is either revocable or expired
    require(_roleData.revocable || _roleData.expirationDate < block.timestamp, "ParcelRolesRegistryFacet: role must be expired or revocable");

    s.erc7432_roles[_role.tokenAddress][_role.tokenId][_role.roleId] = RoleData(_role.recipient, _role.expirationDate, _role.revocable, _role.data);

    emit RoleGranted(
      _role.tokenAddress,
      _role.tokenId,
      _role.roleId,
      _originalOwner,
      _role.recipient,
      _role.expirationDate,
      _role.revocable,
      _role.data
    );
  }

  function revokeRole(address _tokenAddress, uint256 _tokenId, bytes32 _roleId) external override {
    require(s.erc7432_roles[_tokenAddress][_tokenId][_roleId].expirationDate != 0, "ParcelRolesRegistryFacet: role does not exist");

    address _recipient = s.erc7432_roles[_tokenAddress][_tokenId][_roleId].recipient;
    address _caller = _getApprovedCaller(_tokenAddress, _tokenId, _recipient);

    // If caller is recipient, the role can be revoked regardless of its state
    if (_caller != _recipient) {
      // If caller is owner, the role can only be revoked if revocable or expired
      require(
        s.erc7432_roles[_tokenAddress][_tokenId][_roleId].revocable ||
          s.erc7432_roles[_tokenAddress][_tokenId][_roleId].expirationDate < block.timestamp,
        "ParcelRolesRegistryFacet: role is not revocable nor expired"
      );
    }

    delete s.erc7432_roles[_tokenAddress][_tokenId][_roleId];
    emit RoleRevoked(_tokenAddress, _tokenId, _roleId);
  }

  function unlockToken(address _tokenAddress, uint256 _tokenId) external override {
    address _sender = LibMeta.msgSender(); // Optimize call here
    address originalOwner = s.erc7432OriginalOwners[_tokenAddress][_tokenId];

    require(
      originalOwner == _sender || isRoleApprovedForAll(_tokenAddress, originalOwner, _sender),
      "ParcelRolesRegistryFacet: sender must be owner or approved"
    );

    require(!_hasNonRevocableRole(_tokenAddress, _tokenId), "ParcelRolesRegistryFacet: NFT is locked");

    delete s.erc7432OriginalOwners[_tokenAddress][_tokenId];
    IERC721(_tokenAddress).transferFrom(address(this), originalOwner, _tokenId);
    emit TokenUnlocked(originalOwner, _tokenAddress, _tokenId);
  }

  function setRoleApprovalForAll(address _tokenAddress, address _operator, bool _isApproved) external {
    address _sender = LibMeta.msgSender(); // Optimize call here
    s.tokenApprovals[_sender][_tokenAddress][_operator] = _isApproved;
    emit RoleApprovalForAll(_tokenAddress, _operator, _isApproved);
  }

  /** View Functions **/

  /// @notice Checks whether an NFT has at least one non-revocable role.
  /// @param _tokenAddress The token address.
  /// @param _tokenId The token identifier.
  /// @return true if the NFT is locked.
  function _hasNonRevocableRole(address _tokenAddress, uint256 _tokenId) internal view returns (bool) {
    return
      _checkRole(_tokenAddress, _tokenId, keccak256("AlchemicaChanneling()")) ||
      _checkRole(_tokenAddress, _tokenId, keccak256("EmptyReservoir()")) ||
      _checkRole(_tokenAddress, _tokenId, keccak256("EquipInstallations()")) ||
      _checkRole(_tokenAddress, _tokenId, keccak256("EquipTiles()")) ||
      _checkRole(_tokenAddress, _tokenId, keccak256("UpgradeInstallations()"));
  }

  function _checkRole(address _tokenAddress, uint256 _tokenId, bytes32 roleId) internal view returns (bool) {
    RoleData storage _roleData = s.erc7432_roles[_tokenAddress][_tokenId][roleId];
    return (_roleData.expirationDate > block.timestamp && !_roleData.revocable);
  }

  /** ERC-7432 View Functions **/

  // @notice Checks if the grantor approved the operator for all SFTs.
  /// @param _tokenAddress The token address.
  /// @param _grantor The user that approved the operator.
  /// @param _operator The user that can grant and revoke roles.
  /// @return isApproved_ Whether the operator is approved or not.
  function isRoleApprovedForAll(address _tokenAddress, address _grantor, address _operator) public view override returns (bool) {
    return s.tokenApprovals[_grantor][_tokenAddress][_operator];
  }

  function ownerOf(address _tokenAddress, uint256 _tokenId) external view override returns (address owner_) {
    return s.erc7432OriginalOwners[_tokenAddress][_tokenId];
  }

  function recipientOf(address _tokenAddress, uint256 _tokenId, bytes32 _roleId) external view override returns (address recipient_) {
    if (s.erc7432_roles[_tokenAddress][_tokenId][_roleId].expirationDate > block.timestamp) {
      return s.erc7432_roles[_tokenAddress][_tokenId][_roleId].recipient;
    }
    return address(0);
  }

  function roleData(address _tokenAddress, uint256 _tokenId, bytes32 _roleId) external view override returns (bytes memory data_) {
    if (s.erc7432_roles[_tokenAddress][_tokenId][_roleId].expirationDate > block.timestamp) {
      return data_ = s.erc7432_roles[_tokenAddress][_tokenId][_roleId].data;
    }
    return "";
  }

  function roleExpirationDate(address _tokenAddress, uint256 _tokenId, bytes32 _roleId) external view override returns (uint64 expirationDate_) {
    if (s.erc7432_roles[_tokenAddress][_tokenId][_roleId].expirationDate > block.timestamp) {
      return s.erc7432_roles[_tokenAddress][_tokenId][_roleId].expirationDate;
    }
    return 0;
  }

  function isRoleRevocable(address _tokenAddress, uint256 _tokenId, bytes32 _roleId) external view override returns (bool revocable_) {
    return
      s.erc7432_roles[_tokenAddress][_tokenId][_roleId].expirationDate > block.timestamp &&
      s.erc7432_roles[_tokenAddress][_tokenId][_roleId].revocable;
  }

  /** Internal Functions **/

  /// @notice Updates originalOwner, validates the sender and deposits NFT (if not deposited yet).
  /// @param _tokenAddress The token address.
  /// @param _tokenId The token identifier.
  /// @return originalOwner_ The original owner of the NFT.
  function _depositNft(address _tokenAddress, uint256 _tokenId) internal returns (address originalOwner_) {
    address _currentOwner = IERC721(_tokenAddress).ownerOf(_tokenId);
    address _sender = LibMeta.msgSender();
    if (_currentOwner == address(this)) {
      // if the NFT is already on the contract, check if sender is approved or original owner
      originalOwner_ = s.erc7432OriginalOwners[_tokenAddress][_tokenId];
      require(
        originalOwner_ == _sender || isRoleApprovedForAll(_tokenAddress, originalOwner_, _sender),
        "ParcelRolesRegistryFacet: sender must be owner or approved"
      );
    } else {
      // if NFT is not in the contract, deposit it and store the original owner
      require(
        _currentOwner == _sender || isRoleApprovedForAll(_tokenAddress, _currentOwner, _sender),
        "ParcelRolesRegistryFacet: sender must be owner or approved"
      );
      IERC721(_tokenAddress).transferFrom(_currentOwner, address(this), _tokenId);
      s.erc7432OriginalOwners[_tokenAddress][_tokenId] = _currentOwner;
      originalOwner_ = _currentOwner;
      emit TokenLocked(_currentOwner, _tokenAddress, _tokenId);
    }
  }

  /// @notice Returns the account approved to call the revokeRole function. Reverts otherwise.
  /// @param _tokenAddress The token address.
  /// @param _tokenId The token identifier.
  /// @param _recipient The user that received the role.
  /// @return caller_ The approved account.
  function _getApprovedCaller(address _tokenAddress, uint256 _tokenId, address _recipient) internal view returns (address caller_) {
    address _sender = LibMeta.msgSender();
    if (_sender == _recipient || isRoleApprovedForAll(_tokenAddress, _recipient, _sender)) {
      return _recipient;
    }
    address originalOwner = s.erc7432OriginalOwners[_tokenAddress][_tokenId];
    if (_sender == originalOwner || isRoleApprovedForAll(_tokenAddress, originalOwner, _sender)) {
      return originalOwner;
    }
    revert("ParcelRolesRegistryFacet: sender is not approved");
  }

  function supportsInterface(bytes4 interfaceId) external view virtual override returns (bool) {
    return interfaceId == type(IERC7432).interfaceId;
  }
}
