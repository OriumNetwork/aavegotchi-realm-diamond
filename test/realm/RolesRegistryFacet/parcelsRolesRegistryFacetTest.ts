/* global describe it before ethers network */
/* eslint prefer-const: "off" */

//@ts-ignore
import { ethers } from "hardhat";
import chai from "chai";

import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { maticRealmDiamondAddress } from "../../../scripts/tile/helperFunctions";

import { deployParcelsRolesRegistryFacet } from "./deployTest";


const { expect } = chai;

describe("ParcelRolesRegistryFacet", async () => {
  let parcelRolesRegistryFacet: Contract;
  let grantor: SignerWithAddress;
  let lender: SignerWithAddress;
  let grantee: SignerWithAddress;
  let anotherUser: SignerWithAddress;
  let mockERC721: any;
  const ONE_DAY = 60 * 60 * 24;

  const realmDiamondAddress = maticRealmDiamondAddress;

  const ROLE_ALCHEMICA_CHANNELING = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("AlchemicaChanneling()")
  );
  const ROLE_TEST = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("testRole()")
  );

  before(async () => {
    const signers = await ethers.getSigners();
    grantor = signers[0];
    grantee = signers[1];
    lender = signers[2];
    anotherUser = signers[3];

    // Deploy the mock ERC721 contract
    const MockERC721 = await ethers.getContractFactory("MockERC721");
    mockERC721 = await MockERC721.deploy();
    await mockERC721.deployed();

    await deployParcelsRolesRegistryFacet(mockERC721.address);

    // Mint a token to the grantor
    await mockERC721.mint(grantor.address);
    await mockERC721.mint(grantor.address);

    parcelRolesRegistryFacet = await ethers.getContractAt(
      "ParcelRolesRegistryFacet",
      realmDiamondAddress
    );
    // Approve the facet contract to manage grantor's tokens
    await mockERC721
      .connect(grantor)
      .approve(parcelRolesRegistryFacet.address, 1);
    await mockERC721
      .connect(grantor)
      .approve(parcelRolesRegistryFacet.address, 2);

    // Set role approval for the facet contract
    await parcelRolesRegistryFacet
      .connect(grantor)
      .setRoleApprovalForAll(
        mockERC721.address,
        parcelRolesRegistryFacet.address,
        true
      );
  });

  describe("grantRole", async () => {
    it("should revert when sender is not grantor or approved", async () => {
      const role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      // Now try to grant the role
      await expect(
        parcelRolesRegistryFacet.connect(anotherUser).grantRole(role)
      ).to.be.revertedWith(
        "ParcelRolesRegistryFacet: sender must be owner or approved"
      );
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
        parcelRolesRegistryFacet.connect(grantor).grantRole(role)
      ).to.be.revertedWith(
        "ParcelRolesRegistryFacet: expiration date must be in the future"
      );
    });

    it("should grant role when sender is grantor", async () => {
      const role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(grantor).grantRole(role))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role.tokenAddress,
          role.tokenId,
          role.roleId,
          grantor.address,
          role.recipient,
          role.expirationDate,
          role.revocable,
          role.data
        );
    });

    it("should grant role when sender is approved", async () => {
      const role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(grantor).grantRole(role))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role.tokenAddress,
          role.tokenId,
          role.roleId,
          grantor.address,
          role.recipient,
          role.expirationDate,
          role.revocable,
          role.data
        );
    });
  });

  describe("revokeRole", async () => {
    it("should revoke role when sender is grantor", async () => {
      const role1 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };
      await expect(parcelRolesRegistryFacet.connect(grantor).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          grantor.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );

      await parcelRolesRegistryFacet
        .connect(grantor)
        .revokeRole(role1.tokenAddress, role1.tokenId, role1.roleId);
    });

    it("should revoke role when sender is approved", async () => {
      const role1 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(grantor).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          grantor.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );

      await parcelRolesRegistryFacet
        .connect(grantor)
        .setRoleApprovalForAll(role1.tokenAddress, anotherUser.address, true);

      await expect(
        parcelRolesRegistryFacet
          .connect(anotherUser)
          .revokeRole(role1.tokenAddress, role1.tokenId, role1.roleId)
      )
        .to.emit(parcelRolesRegistryFacet, "RoleRevoked")
        .withArgs(role1.tokenAddress, role1.tokenId, role1.roleId);
    });

    it("should revert when sender is not grantor or approved", async () => {
      const role1 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(grantor).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          grantor.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );

      await parcelRolesRegistryFacet
        .connect(grantor)
        .setRoleApprovalForAll(role1.tokenAddress, anotherUser.address, false);

      await expect(
        parcelRolesRegistryFacet
          .connect(anotherUser)
          .revokeRole(role1.tokenAddress, role1.tokenId, role1.roleId)
      ).to.be.revertedWith(
        "ParcelRolesRegistryFacet: role does not exist or sender is not approved"
      );
    });

    it("should revert when the role does not exist", async () => {
      const role1 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(grantor).grantRole(role1))
        .to.emit(parcelRolesRegistryFacet, "RoleGranted")
        .withArgs(
          role1.tokenAddress,
          role1.tokenId,
          role1.roleId,
          grantor.address,
          role1.recipient,
          role1.expirationDate,
          role1.revocable,
          role1.data
        );

      await expect(
        parcelRolesRegistryFacet
          .connect(grantor)
          .revokeRole(role1.tokenAddress, role1.tokenId, ROLE_TEST)
      ).to.be.revertedWith("ParcelRolesRegistryFacet: role does not exist");
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

    it("should revert when NFT is locked with non-revocable role", async () => {
      role1 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: false,
        data: "0x",
      };

      await expect(parcelRolesRegistryFacet.connect(grantor).grantRole(role1))
        .to.not.be.reverted;

      await expect(
        parcelRolesRegistryFacet
          .connect(grantor)
          .unlockToken(role1.tokenAddress, role1.tokenId)
      ).to.be.revertedWith("ParcelRolesRegistryFacet: NFT is locked");
    });

    it("should unlock token when all roles are revocable or expired", async () => {
      role1 = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: mockERC721.address,
        tokenId: 2,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await parcelRolesRegistryFacet.connect(grantor).grantRole(role1);

      await expect(
        parcelRolesRegistryFacet
          .connect(grantor)
          .unlockToken(role1.tokenAddress, role1.tokenId)
      )
        .to.emit(parcelRolesRegistryFacet, "TokenUnlocked")
        .withArgs(grantor.address, role1.tokenAddress, role1.tokenId);
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
          .connect(grantor)
          .setRoleApprovalForAll(role1.tokenAddress, anotherUser.address, true)
      )
        .to.emit(parcelRolesRegistryFacet, "RoleApprovalForAll")
        .withArgs(role1.tokenAddress, anotherUser.address, true);
    });
  });
});
