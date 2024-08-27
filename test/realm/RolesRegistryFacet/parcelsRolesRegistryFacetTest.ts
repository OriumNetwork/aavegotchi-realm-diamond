

/* global describe it before ethers network */
/* eslint prefer-const: "off" */

//@ts-ignore
import { ethers, network } from "hardhat";
import chai from "chai";
import { ParcelRolesRegistryFacet} from "../../../typechain-types";

import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { maticRealmDiamondAddress } from "../../../scripts/tile/helperFunctions";
import {  deployParcelsRolesRegistryFacet } from "./deployTest";

const { expect } = chai;

describe("ParcelRolesRegistryFacet", async () => {
  let parcelRolesRegistryFacet: Contract;
  let grantor: SignerWithAddress;
  let grantee: SignerWithAddress;
  let anotherUser: SignerWithAddress;
  let mockERC721: any
  const ONE_DAY = 60 * 60 * 24;

  const realmDiamondAddress = maticRealmDiamondAddress;
  const ROLE_ALCHEMICA_CHANNELING = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("AlchemicaChanneling()"));

  before(async () => {
    // Reset hardhat network
    // await network.provider.request({
    //   method: "hardhat_reset",
    //   params: [{ forking: { jsonRpcUrl: process.env.MATIC_URL } }],
    // });

    const signers = await ethers.getSigners();
    grantor = signers[0];
    grantee = signers[1];
    anotherUser = signers[2];

   await deployParcelsRolesRegistryFacet();

   console.log("passou aqui hein")

     // Deploy the mock ERC721 contract
     const MockERC721 = await ethers.getContractFactory("MockERC721");
     mockERC721 = await MockERC721.deploy();
     await mockERC721.deployed();

     // Mint a token to the grantor
     await mockERC721.mint(grantor.address);

   parcelRolesRegistryFacet = await ethers.getContractAt(
  "ParcelRolesRegistryFacet",
  realmDiamondAddress
);

    await parcelRolesRegistryFacet.setRoleApprovalForAll(mockERC721.address, grantor.address, true);

  });

    describe('grantRole', async () => {
      it.only('should revert when sender is not grantor or approved', async () => {
          const role = {
              roleId: ROLE_ALCHEMICA_CHANNELING,
              tokenAddress: mockERC721.address,
              tokenId: 1,
              recipient: grantee.address,
              expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
              revocable: true,
              data: "0x",
          };
  
          // Transfer the token to the contract to simulate the required ownership
          await mockERC721.connect(grantor).transferFrom(grantor.address, parcelRolesRegistryFacet.address, 1);
  
          // Ensure the contract now owns the token
          const currentOwner = await mockERC721.ownerOf(1);
          console.log("Current owner of the token after transfer:", currentOwner);
          expect(currentOwner).to.equal(parcelRolesRegistryFacet.address);
  
          // Check approval status
          let isApproved = await parcelRolesRegistryFacet.isRoleApprovedForAll(mockERC721.address, grantor.address, parcelRolesRegistryFacet.address);
          console.log("Is anotherUser approved to manage grantor's roles after transfer?", isApproved);
  
          // Test the expected revert
          await expect(
              parcelRolesRegistryFacet.connect(anotherUser).grantRole(role)
          ).to.be.revertedWith('ParcelRolesRegistryFacet: account not approved');
      });


    it('should revert when expirationDate is zero', async () => {
      const role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: realmDiamondAddress,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: 0,
        revocable: true,
        data: "0x",
      };

      await expect(
        parcelRolesRegistryFacet.connect(grantor).grantRole(role)
      ).to.be.revertedWith('ParcelRolesRegistryFacet: expiration date must be in the future');
    });

    it('should grant role when sender is grantor', async () => {

      const role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: realmDiamondAddress,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(
        parcelRolesRegistryFacet.connect(grantor).grantRole(role)
      )
        .to.emit(parcelRolesRegistryFacet, 'RoleGranted')
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

    it('should grant role when sender is approved', async () => {
      const role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: realmDiamondAddress,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(
        parcelRolesRegistryFacet.connect(anotherUser).grantRole(role)
      )
        .to.emit(parcelRolesRegistryFacet, 'RoleGranted')
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

  describe('revokeRole', async () => {
    let role: { tokenAddress: any; tokenId: any; roleId: any; revocable: any; recipient?: string; expirationDate?: number; data?: string; };

    beforeEach(async () => {
      role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: realmDiamondAddress,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(
        parcelRolesRegistryFacet.connect(grantor).grantRole(role)
      ).to.not.be.reverted;
    });

    it('should revert when sender is not grantor or approved', async () => {
      await parcelRolesRegistryFacet.connect(grantor).setRoleApprovalForAllFacet(
        role.tokenAddress,
        anotherUser.address,
        false,
      );

      await expect(
        parcelRolesRegistryFacet.connect(anotherUser).revokeRole(
          role.tokenAddress,
          role.tokenId,
          role.roleId,
        ),
      ).to.be.revertedWith('ParcelRolesRegistryFacet: role does not exist or sender is not approved');
    });

    it('should revert when the role is not revocable and not expired', async () => {
      role.revocable = false;

      await expect(
        parcelRolesRegistryFacet.connect(grantor).grantRole(role)
      ).to.not.be.reverted;

      await expect(
        parcelRolesRegistryFacet.connect(grantor).revokeRole(
          role.tokenAddress,
          role.tokenId,
          role.roleId,
        ),
      ).to.be.revertedWith('ParcelRolesRegistryFacet: role is not revocable nor expired');
    });

    it('should revoke role when sender is grantor', async () => {
      await expect(
        parcelRolesRegistryFacet.connect(grantor).revokeRole(
          role.tokenAddress,
          role.tokenId,
          role.roleId,
        ),
      )
        .to.emit(parcelRolesRegistryFacet, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId);
    });

    it('should revoke role when sender is approved', async () => {
      await parcelRolesRegistryFacet.connect(grantor).setRoleApprovalForAllFacet(
        role.tokenAddress,
        anotherUser.address,
        true,
      );

      await expect(
        parcelRolesRegistryFacet.connect(anotherUser).revokeRole(
          role.tokenAddress,
          role.tokenId,
          role.roleId,
        ),
      )
        .to.emit(parcelRolesRegistryFacet, 'RoleRevoked')
        .withArgs(role.tokenAddress, role.tokenId, role.roleId);
    });
  });

  describe('unlockToken', async () => {
    let role: { tokenAddress: any; tokenId: any; revocable: any; roleId?: string; recipient?: string; expirationDate?: number; data?: string; };

    beforeEach(async () => {
      role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: realmDiamondAddress,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: false,
        data: "0x",
      };

      await expect(
        parcelRolesRegistryFacet.connect(grantor).grantRole(role)
      ).to.not.be.reverted;
    });

    it('should revert when NFT is locked with non-revocable role', async () => {
      await expect(
        parcelRolesRegistryFacet.connect(grantor).unlockToken(
          role.tokenAddress,
          role.tokenId
        ),
      ).to.be.revertedWith('ParcelRolesRegistryFacet: NFT is locked');
    });

    it('should unlock token when all roles are revocable or expired', async () => {
      role.revocable = true;

      await expect(
        parcelRolesRegistryFacet.connect(grantor).grantRole(role)
      ).to.not.be.reverted;

      await expect(
        parcelRolesRegistryFacet.connect(grantor).unlockToken(
          role.tokenAddress,
          role.tokenId
        ),
      )
        .to.emit(parcelRolesRegistryFacet, 'TokenUnlocked')
        .withArgs(grantor.address, role.tokenAddress, role.tokenId);
    });
  });

  describe('view functions', async () => {
    let role: { tokenAddress: any; tokenId: any; roleId: any; data: any; expirationDate: any; revocable: any; recipient?: string; };

    beforeEach(async () => {
      role = {
        roleId: ROLE_ALCHEMICA_CHANNELING,
        tokenAddress: realmDiamondAddress,
        tokenId: 1,
        recipient: grantee.address,
        expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
        revocable: true,
        data: "0x",
      };

      await expect(
        parcelRolesRegistryFacet.connect(grantor).grantRole(role)
      ).to.not.be.reverted;
    });

    it('should return role data', async () => {
      expect(
        await parcelRolesRegistryFacet.roleData(role.tokenAddress, role.tokenId, role.roleId)
      ).to.be.equal(role.data);

      expect(
        await parcelRolesRegistryFacet.roleExpirationDate(role.tokenAddress, role.tokenId, role.roleId)
      ).to.be.equal(role.expirationDate);

      expect(
        await parcelRolesRegistryFacet.isRoleRevocable(role.tokenAddress, role.tokenId, role.roleId)
      ).to.be.equal(role.revocable);

      expect(
        await parcelRolesRegistryFacet.ownerOf(role.tokenAddress, role.tokenId)
      ).to.be.equal(grantor.address);

      expect(
        await parcelRolesRegistryFacet.recipientOf(role.tokenAddress, role.tokenId, role.roleId)
      ).to.be.equal(grantee.address);
    });
  });

  describe('ERC-165 supportsInterface', async () => {
    it('should return true if ERC7432 interface id', async () => {
      expect(await parcelRolesRegistryFacet.supportsInterface('0xd00ca5cf')).to.be.true;
    });
  });
});
