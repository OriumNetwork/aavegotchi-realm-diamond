/* global describe it before ethers network */
/* eslint prefer-const: "off" */

//@ts-ignore
import { ethers, network } from "hardhat";
import chai from "chai";

import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { maticRealmDiamondAddress } from "../../../scripts/tile/helperFunctions";

import { deployParcelsRolesRegistryFacet } from "./deployTest";

const { expect } = chai;
const { AddressZero, HashZero } = ethers.constants;

describe("ParcelRolesRegistryFacet", async () => {
  let parcelRolesRegistryFacet: Contract;
  let owner: SignerWithAddress;
  let lender: SignerWithAddress;
  let grantee: SignerWithAddress;
  let anotherUser: SignerWithAddress;
  let recipient1: SignerWithAddress;
  let recipient2: SignerWithAddress;
  let recipient3: SignerWithAddress;
  let recipient4: SignerWithAddress;
  let borrower: SignerWithAddress;
  let mockERC721: Contract;
  let mockERC20: Contract;
  let anotherMockERC721: Contract;
  let testContract: Contract;
  const ONE_DAY = 60 * 60 * 24;

  const realmDiamondAddress = maticRealmDiamondAddress;

  const ROLE_ALCHEMICA_CHANNELING = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("AlchemicaChanneling()")
  );

  const ROLE_EQUIP_INSTALLATIONS = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("EquipInstallations()")
  );

  const ROLE_TEST = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("testRole()")
  );

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.MATIC_URL,
          },
        },
      ],
    });
    const signers = await ethers.getSigners();
    owner = signers[0];
    grantee = signers[1];
    lender = signers[2];
    anotherUser = signers[3];
    recipient1 = signers[4];
    recipient2 = signers[5];
    recipient3 = signers[6];
    recipient4 = signers[7];
    borrower = signers[8];

    const MockERC721 = await ethers.getContractFactory("MockERC721");
    mockERC721 = await MockERC721.deploy();
    await mockERC721.deployed();

    const MockERC20 = await ethers.getContractFactory("ERC20Generic");
    mockERC20 = await MockERC20.deploy();
    await mockERC721.deployed();

    const AnotherMockERC721 = await ethers.getContractFactory("MockERC721");
    anotherMockERC721 = await AnotherMockERC721.deploy();
    await anotherMockERC721.deployed();

    const TestVerifyAccessRight = await ethers.getContractFactory(
      "TestVerifyAccessRight"
    );
    testContract = await TestVerifyAccessRight.deploy();
    await testContract.deployed();

    await testContract.setParcelOwner(1, grantee.address);

    await testContract.setAccessRight(1, 0, 0); // Action 0: Only owner can access

    await deployParcelsRolesRegistryFacet(mockERC721.address);

    await mockERC721.mint(owner.address);
    await mockERC721.mint(owner.address);
    await mockERC721.mint(owner.address);
    await mockERC721.mint(owner.address);
    await mockERC721.mint(owner.address);
    await mockERC721.mint(owner.address);

    parcelRolesRegistryFacet = await ethers.getContractAt(
      "ParcelRolesRegistryFacet",
      realmDiamondAddress
    );

    await testContract.setRolesRegistryAddress(
      parcelRolesRegistryFacet.address
    );

    // Approve the facet contract to manage owner's tokens
    await mockERC721
      .connect(owner)
      .approve(parcelRolesRegistryFacet.address, 1);

    await mockERC721
      .connect(owner)
      .approve(parcelRolesRegistryFacet.address, 2);
    await mockERC721
      .connect(owner)
      .approve(parcelRolesRegistryFacet.address, 3);
    await mockERC721
      .connect(owner)
      .approve(parcelRolesRegistryFacet.address, 4);
    await mockERC721
      .connect(owner)
      .approve(parcelRolesRegistryFacet.address, 5);
    await mockERC721
      .connect(owner)
      .approve(parcelRolesRegistryFacet.address, 6);

    await parcelRolesRegistryFacet
      .connect(owner)
      .setRoleApprovalForAll(
        mockERC721.address,
        parcelRolesRegistryFacet.address,
        true
      );
  });

  describe("grantRole", async () => {
    it("should revert when sender is not owner or approved", async () => {
      const role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(
        parcelRolesRegistryFacet.connect(anotherUser).grantRole(role)
      ).to.be.revertedWith(
        "ParcelRolesRegistryFacet: sender must be owner or approved"
      );
    });

    it("should revert when the user is not approved nor the original owner of the NFT", async () => {
      const role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await parcelRolesRegistryFacet
        .connect(anotherUser)
        .setRoleApprovalForAll(role.tokenAddress, grantee.address, true);

      await expect(
        parcelRolesRegistryFacet.connect(grantee).grantRole(role)
      ).to.be.revertedWith(
        "ParcelRolesRegistryFacet: sender must be owner or approved"
      );
    });

    it("should revert when tokenAddress is not Realm", async () => {
      const role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: anotherMockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(
        parcelRolesRegistryFacet.connect(anotherUser).grantRole(role)
      ).to.be.revertedWith(
        "ParcelRolesRegistryFacet: Only Realm NFTs are supported"
      );
    });

    it("should revert when roleId isn't approved", async () => {
      const role = {
        roleId: ROLE_TEST,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(
        parcelRolesRegistryFacet.connect(anotherUser).grantRole(role)
      ).to.be.revertedWith("ParcelRolesRegistryFacet: invalid role ID");
    });

    it("should revert when expirationDate is zero", async () => {
      const role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: 0,
        revocable: true,
        data: "0x",
      };

      await expect(
        parcelRolesRegistryFacet.connect(owner).grantRole(role)
      ).to.be.revertedWith(
        "ParcelRolesRegistryFacet: expiration date must be in the future"
      );
    });

    it("should grant role when sender is owner", async () => {
      const role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role.tokenAddress,
          role.tokenId,
          role.roleId,
          owner.address,
          role.recipient,
          role.expirationDate,
          role.revocable,
          role.data
        );
    });

    it("should grant role when sender is approved by owner", async () => {
      const role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await parcelRolesRegistryFacet
        .connect(owner)
        .setRoleApprovalForAll(role.tokenAddress, anotherUser.address, true);

      await expect(
        parcelRolesRegistryFacet.connect(anotherUser).grantRole(role)
      )
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role.tokenAddress,
          role.tokenId,
          role.roleId,
          owner.address,
          role.recipient,
          role.expirationDate,
          role.revocable,
          role.data
        );
    });
  });

  describe("grantRole with Profit Share", async () => {
    const ONE_DAY = 60 * 60 * 24;
    let roleWithProfitShare;

    beforeEach(async () => {
      const tokenAddresses = [mockERC20.address];
      const shares = [[3000, 4000, 1500, 1500]];
      const recipients = [[recipient1.address, recipient2.address]];

      const encodedData = ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint16[][]", "address[][]"],
        [tokenAddresses, shares, recipients]
      );

      roleWithProfitShare = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: borrower.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: encodedData,
      };
    });

    it("should process profit share for AlchemicaChanneling role with valid owner and borrower shares", async () => {
      await expect(
        parcelRolesRegistryFacet.connect(owner).grantRole(roleWithProfitShare)
      )
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          roleWithProfitShare.tokenAddress,
          roleWithProfitShare.tokenId,
          roleWithProfitShare.roleId,
          owner.address,
          roleWithProfitShare.recipient,
          roleWithProfitShare.expirationDate,
          roleWithProfitShare.revocable,
          roleWithProfitShare.data
        );

      const [
        storedOwnerShare,
        storedBorrowerShare,
        storedTokenAddresses,
        storedSharesArray,
        storedRecipientsArray,
      ] = await parcelRolesRegistryFacet.getProfitShare(
        roleWithProfitShare.tokenAddress,
        roleWithProfitShare.tokenId,
        roleWithProfitShare.roleId
      );

      expect(storedOwnerShare).to.equal(3000);
      expect(storedBorrowerShare).to.equal(4000);

      const totalRemainingShare =
        10000 - storedOwnerShare - storedBorrowerShare;
      expect(totalRemainingShare).to.equal(3000);

      expect(storedTokenAddresses.length).to.equal(1);
      expect(storedTokenAddresses).to.deep.equal([mockERC20.address]);

      expect(storedSharesArray.length).to.equal(1);
      expect(storedSharesArray[0]).to.deep.equal([3000, 4000, 1500, 1500]);

      expect(storedRecipientsArray.length).to.equal(1);
      expect(storedRecipientsArray[0]).to.deep.equal([
        recipient1.address,
        recipient2.address,
      ]);
    });

    it("should allow ownerShare + borrowerShare to equal 100%", async () => {
      const tokenAddresses = [mockERC20.address];
      const shares = [[6000, 4000]];
      const recipients = [[]];

      const encodedDataValid = ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint16[][]", "address[][]"],
        [tokenAddresses, shares, recipients]
      );

      const validRole = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: borrower.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: encodedDataValid,
      };

      await expect(
        parcelRolesRegistryFacet.connect(owner).grantRole(validRole)
      ).to.emit(parcelRolesRegistryFacet, "RoleGranted");

      const [
        storedOwnerShare,
        storedBorrowerShare,
        storedTokenAddresses,
        storedSharesArray,
        storedRecipientsArray,
      ] = await parcelRolesRegistryFacet.getProfitShare(
        validRole.tokenAddress,
        validRole.tokenId,
        validRole.roleId
      );

      expect(storedOwnerShare).to.equal(6000);
      expect(storedBorrowerShare).to.equal(4000);

      const remainingShare = 10000 - storedOwnerShare - storedBorrowerShare;
      expect(remainingShare).to.equal(0); // Since owner + borrower shares sum to 10000

      expect(storedTokenAddresses.length).to.equal(1);
      expect(storedTokenAddresses).to.deep.equal([mockERC20.address]);

      expect(storedSharesArray.length).to.equal(1);
      expect(storedSharesArray[0]).to.deep.equal([6000, 4000]);

      expect(storedRecipientsArray.length).to.equal(1);
      expect(storedRecipientsArray[0]).to.deep.equal([]); // No recipients
    });

    it("should revert if recipient shares do not match the remaining share", async () => {
      const tokenAddresses = [mockERC20.address];
      const shares = [[3000, 4000, 1000, 1000]];
      const recipients = [[recipient1.address, recipient2.address]];

      const encodedDataInvalid = ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint16[][]", "address[][]"],
        [tokenAddresses, shares, recipients]
      );

      const invalidRole = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: borrower.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: encodedDataInvalid,
      };

      await expect(
        parcelRolesRegistryFacet.connect(owner).grantRole(invalidRole)
      ).to.be.revertedWith(
        "ParcelRolesRegistryFacet: Recipient shares do not match the remaining share"
      );
    });

    it("should revert due the error in decode", async () => {
      const tokenAddresses = [mockERC20.address];
      const shares = [[3000, 4000, 1000, 1000]];
      const recipients = [[recipient1.address, recipient2.address]];

      const encodedDataInvalid = ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint16[][]", "address[][]"],
        [tokenAddresses, shares, recipients]
      );

      const invalidRole = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: borrower.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: encodedDataInvalid,
      };

      await expect(
        parcelRolesRegistryFacet.connect(owner).grantRole(invalidRole)
      ).to.be.revertedWith(
        "ParcelRolesRegistryFacet: Recipient shares do not match the remaining share"
      );
    });

    it("should revert if recipient shares don't sum to the remaining share after owner and borrower shares", async () => {
      const tokenAddresses = [mockERC20.address];
      const shares = [[3000, 4000, 1500, 500]];
      const recipients = [[recipient1.address, recipient2.address]];

      const encodedDataInvalid = ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint16[][]", "address[][]"],
        [tokenAddresses, shares, recipients]
      );

      const invalidRole = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: borrower.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: encodedDataInvalid,
      };

      await expect(
        parcelRolesRegistryFacet.connect(owner).grantRole(invalidRole)
      ).to.be.revertedWith(
        "ParcelRolesRegistryFacet: Recipient shares do not match the remaining share"
      );
    });

    it("should store the correct profit share data with owner and borrower shares set separately", async () => {
      const tokenAddresses = [mockERC20.address];
      const validShares = [[3000, 4000, 1500, 1500]];
      const recipients = [[recipient1.address, recipient2.address]];

      const encodedDataValid = ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint16[][]", "address[][]"],
        [tokenAddresses, validShares, recipients]
      );

      const roleWithProfitShare = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: borrower.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: encodedDataValid,
      };

      await parcelRolesRegistryFacet
        .connect(owner)
        .grantRole(roleWithProfitShare);

      const [
        storedOwnerShare,
        storedBorrowerShare,
        storedTokenAddresses,
        storedSharesArray,
        storedRecipientsArray,
      ] = await parcelRolesRegistryFacet.getProfitShare(
        roleWithProfitShare.tokenAddress,
        roleWithProfitShare.tokenId,
        roleWithProfitShare.roleId
      );

      expect(storedOwnerShare).to.equal(3000);
      expect(storedBorrowerShare).to.equal(4000);

      const remainingShare = 10000 - storedOwnerShare - storedBorrowerShare;
      expect(remainingShare).to.equal(3000);

      expect(storedTokenAddresses.length).to.equal(1);
      expect(storedTokenAddresses).to.deep.equal([mockERC20.address]);

      expect(storedSharesArray.length).to.equal(1);
      expect(storedSharesArray[0]).to.deep.equal([3000, 4000, 1500, 1500]);

      expect(storedRecipientsArray.length).to.equal(1);
      expect(storedRecipientsArray[0]).to.deep.equal([
        recipient1.address,
        recipient2.address,
      ]);
    });

    it("should store the correct profit share data for multiple tokens", async () => {
      const profitTokens = [mockERC20.address, ethers.constants.AddressZero];
      const sharesArray = [
        [3000, 4000, 1500, 1500],
        [3000, 4000, 1500, 1500],
      ];
      const recipientsArray = [
        [recipient1.address, recipient2.address],
        [recipient3.address, recipient4.address],
      ];

      const encodedDataValid = ethers.utils.defaultAbiCoder.encode(
        ["address[]", "uint16[][]", "address[][]"],
        [profitTokens, sharesArray, recipientsArray]
      );

      const roleWithProfitShare = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: borrower.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: encodedDataValid,
      };

      await expect(
        parcelRolesRegistryFacet.connect(owner).grantRole(roleWithProfitShare)
      )
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          roleWithProfitShare.tokenAddress,
          roleWithProfitShare.tokenId,
          roleWithProfitShare.roleId,
          owner.address,
          roleWithProfitShare.recipient,
          roleWithProfitShare.expirationDate,
          roleWithProfitShare.revocable,
          roleWithProfitShare.data
        );

      // Retrieve and validate profit share data
      const [
        storedOwnerShare,
        storedBorrowerShare,
        storedTokenAddresses,
        storedSharesArray,
        storedRecipientsArray,
      ] = await parcelRolesRegistryFacet.getProfitShare(
        roleWithProfitShare.tokenAddress,
        roleWithProfitShare.tokenId,
        roleWithProfitShare.roleId
      );

      expect(storedOwnerShare).to.equal(3000);
      expect(storedBorrowerShare).to.equal(4000);
      expect(storedTokenAddresses).to.deep.equal(profitTokens);
      expect(storedSharesArray).to.deep.equal(sharesArray);
      expect(storedRecipientsArray).to.deep.equal(recipientsArray);
    });

    it("should allow empty data for non-profit-share roles", async () => {
      const nonProfitRole = {
        roleId: ROLE_EQUIP_INSTALLATIONS,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(
        parcelRolesRegistryFacet.connect(owner).grantRole(nonProfitRole)
      )
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          nonProfitRole.tokenAddress,
          nonProfitRole.tokenId,
          nonProfitRole.roleId,
          owner.address,
          nonProfitRole.recipient,
          nonProfitRole.expirationDate,
          nonProfitRole.revocable,
          nonProfitRole.data
        );

      const roleData = await parcelRolesRegistryFacet.roleData(
        nonProfitRole.tokenAddress,
        nonProfitRole.tokenId,
        nonProfitRole.roleId
      );
      expect(roleData).to.equal("0x");
    });
  });

  describe("revokeRole", async () => {
    let role1: {
      tokenAddress: any;
      tokenId: any;
      roleId: any;
      data: any;
      expirationDate: any;
      revocable: any;
      recipient?: string;
    };

    beforeEach(async () => {
      role1 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };
    });

    it("should revoke role when sender is owner", async () => {
      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          owner.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );

      await parcelRolesRegistryFacet
        .connect(owner)
        .revokeRole(role1.tokenAddress, role1.tokenId, role1.roleId);
    });

    it("should revoke role when sender is approved", async () => {
      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          owner.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );

      await parcelRolesRegistryFacet
        .connect(owner)
        .setRoleApprovalForAll(role1.tokenAddress, anotherUser.address, true);

      await expect(
        parcelRolesRegistryFacet
          .connect(anotherUser)
          .revokeRole(role1.tokenAddress, role1.tokenId, role1.roleId)
      )
        .to.emit(parcelRolesRegistryFacet, "RoleRevoked")
        .withArgs(role1.tokenAddress, role1.tokenId, role1.roleId);
    });

    it("should revoke role when sender is owner, and role is not revocable but is expired", async () => {
      const role2 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 2,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role2))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role2.tokenAddress,
          role2.tokenId,
          role2.roleId,
          owner.address,
          role2.recipient,
          role2.expirationDate,
          role2.revocable,
          role2.data
        );

      await network.provider.send("evm_increaseTime", [ONE_DAY + 10]);
      await network.provider.send("evm_mine");

      await expect(
        parcelRolesRegistryFacet
          .connect(owner)
          .revokeRole(role2.tokenAddress, role2.tokenId, role2.roleId)
      )
        .to.emit(parcelRolesRegistryFacet, "RoleRevoked")
        .withArgs(role2.tokenAddress, role2.tokenId, role2.roleId);
    });

    it("should revoke role when sender is owner, and role is revocable", async () => {
      const role2 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 2,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role2))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role2.tokenAddress,
          role2.tokenId,
          role2.roleId,
          owner.address,
          role2.recipient,
          role2.expirationDate,
          role2.revocable,
          role2.data
        );

      await expect(
        parcelRolesRegistryFacet
          .connect(owner)
          .revokeRole(role2.tokenAddress, role2.tokenId, role2.roleId)
      )
        .to.emit(parcelRolesRegistryFacet, "RoleRevoked")
        .withArgs(role2.tokenAddress, role2.tokenId, role2.roleId);
    });

    it("should revert when sender is not owner or approved to revoke role", async () => {
      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          owner.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );

      await parcelRolesRegistryFacet
        .connect(owner)
        .setRoleApprovalForAll(role1.tokenAddress, anotherUser.address, false);

      await expect(
        parcelRolesRegistryFacet
          .connect(anotherUser)
          .revokeRole(role1.tokenAddress, role1.tokenId, role1.roleId)
      ).to.be.revertedWith("ParcelRolesRegistryFacet: sender is not approved");
    });

    it("should revert when the role does not exist", async () => {
      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          owner.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );

      await expect(
        parcelRolesRegistryFacet
          .connect(owner)
          .revokeRole(role1.tokenAddress, role1.tokenId, ROLE_TEST)
      ).to.be.revertedWith("ParcelRolesRegistryFacet: role does not exist");
    });

    it("should revert if role was already revoked", async () => {
      const role2 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 2,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role2))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role2.tokenAddress,
          role2.tokenId,
          role2.roleId,
          owner.address,
          role2.recipient,
          role2.expirationDate,
          role2.revocable,
          role2.data
        );

      await expect(
        parcelRolesRegistryFacet
          .connect(owner)
          .revokeRole(role2.tokenAddress, role2.tokenId, role2.roleId)
      )
        .to.emit(parcelRolesRegistryFacet, "RoleRevoked")
        .withArgs(role2.tokenAddress, role2.tokenId, role2.roleId);

      await expect(
        parcelRolesRegistryFacet
          .connect(owner)
          .revokeRole(role2.tokenAddress, role2.tokenId, role2.roleId)
      ).to.be.revertedWith("ParcelRolesRegistryFacet: role does not exist");
    });

    it("should revert when role is not revocable nor expired", async () => {
      const role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: false,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role.tokenAddress,
          role.tokenId,
          role.roleId,
          owner.address,
          role.recipient,
          role.expirationDate,
          false,
          role.data
        );

      await expect(
        parcelRolesRegistryFacet
          .connect(owner)
          .revokeRole(role.tokenAddress, role.tokenId, role.roleId)
      ).to.be.revertedWith(
        "ParcelRolesRegistryFacet: role is not revocable nor expired"
      );
    });
  });

  describe("unlockToken", async () => {
    let role1: {
      tokenAddress: any;
      tokenId: any;
      roleId: any;
      data: any;
      expirationDate: any;
      revocable: any;
      recipient?: string;
    };

    it("should unlock token when all roles are revocable or expired", async () => {
      role1 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 3,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          owner.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );

      role1 = {
        roleId: ROLE_EQUIP_INSTALLATIONS,
        tokenAddress: mockERC721.address,
        tokenId: 3,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          owner.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );

      await expect(
        parcelRolesRegistryFacet
          .connect(owner)
          .unlockToken(role1.tokenAddress, role1.tokenId)
      )
        .to.emit(parcelRolesRegistryFacet, "TokenUnlocked")
        .withArgs(owner.address, role1.tokenAddress, role1.tokenId);
    });

    it("should revert unlock token when one role is non revocable or non expired", async () => {
      role1 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 4,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          owner.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );

      role1 = {
        roleId: ROLE_EQUIP_INSTALLATIONS,
        tokenAddress: mockERC721.address,
        tokenId: 4,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: false,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          owner.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );

      await expect(
        parcelRolesRegistryFacet
          .connect(owner)
          .unlockToken(role1.tokenAddress, role1.tokenId)
      ).to.be.revertedWith("ParcelRolesRegistryFacet: NFT is locked");
    });

    it("should revert when NFT is locked with non-revocable role", async () => {
      role1 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 5,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: false,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          owner.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );

      await expect(
        parcelRolesRegistryFacet
          .connect(owner)
          .unlockToken(role1.tokenAddress, role1.tokenId)
      ).to.be.revertedWith("ParcelRolesRegistryFacet: NFT is locked");
    });
    it("should revert if sender is not original owner or approved", async () => {
      role1 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 5,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(
        parcelRolesRegistryFacet
          .connect(owner)
          .unlockToken(role1.tokenAddress, role1.tokenId + 1)
      ).to.be.revertedWith(
        "ParcelRolesRegistryFacet: sender must be owner or approved"
      );
    });
  });

  describe("AccessRight", async () => {
    it("should allow role recipient to access after granting the role", async () => {
      const role1 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 6,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          owner.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );

      await expect(testContract.testVerifyAccessRight(1, 0, 0, role1.recipient))
        .to.be.not.reverted;
    });

    it("should revert if user without role or ownership tries to access", async () => {
      const role1 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 6,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(owner).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          owner.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );
      await expect(
        testContract.testVerifyAccessRight(1, 0, 0, anotherUser.address)
      ).to.be.revertedWith("LibRealm: Access Right - Only Owner");
    });
  });

  describe("setRoleApproval", async () => {
    it("should set role approve for all", async () => {
      const role1 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(
        parcelRolesRegistryFacet
          .connect(owner)
          .setRoleApprovalForAll(role1.tokenAddress, anotherUser.address, true)
      )
        .to.emit(parcelRolesRegistryFacet, "RoleApprovalForAll")
        .withArgs(role1.tokenAddress, anotherUser.address, true);
    });
  });
});
