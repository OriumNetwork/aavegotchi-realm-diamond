import { diamondOwner,  } from "../../helperFunctions";
import {
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
  convertFacetAndSelectorsToString,
} from "../../../tasks/deployUpgrade";
import { varsForNetwork } from "../../../constants";
import { InitParcelsRolesRegistryFacet__factory } from "../../../typechain-types";
import { InitParcelsRolesRegistryFacetInterface } from "../../../typechain-types/contracts/RealmDiamond/init/InitParcelsRolesRegistryFacet";

import { ethers, run } from "hardhat";

export async function deployParcelsRolesRegistryFacet(mockERC721Address: string) {
    const vars = await varsForNetwork(ethers);
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName:
        "contracts/RealmDiamond/facets/ParcelRolesRegistryFacet.sol:ParcelRolesRegistryFacet",
      addSelectors: [
        "function grantRole((bytes32,address,uint256,address,uint64,bool,bytes) calldata _role) external",
        "function revokeRole(address _tokenAddress, uint256 _tokenId, bytes32 _roleId) external",
        "function unlockToken(address _tokenAddress, uint256 _tokenId) external",
        "function setRoleApprovalForAll(address _tokenAddress, address _operator, bool  _isApproved) external",
        "function ownerOf(address _tokenAddress, uint256 _tokenId) external view returns (address owner_)",
        "function recipientOf(address _tokenAddress, uint256 _tokenId, bytes32 _roleId) external view returns (address recipient_)",
        "function roleData(address _tokenAddress, uint256 _tokenId, bytes32 _roleId) external view returns (bytes memory data_)",
        "function roleExpirationDate(address _tokenAddress, uint256 _tokenId, bytes32 _roleId) external view returns (uint64 expirationDate_)",
        "function isRoleRevocable(address _tokenAddress, uint256 _tokenId, bytes32 _roleId) external view returns (bool revocable_)",
        "function isRoleApprovedForAll(address _tokenAddress, address _owner, address _operator) external view returns (bool)",
        "function MAX_EXPIRATION_DATE()",
        "function isValidRole(bytes32 roleId) external view returns (bool)"
      ],
      removeSelectors: [],
    },

    {
      facetName:
        "contracts/RealmDiamond/init/InitParcelsRolesRegistryFacet.sol:InitParcelsRolesRegistryFacet",
      addSelectors: ["function init() external"],
      removeSelectors: [],
    },
  ];


  let iface: InitParcelsRolesRegistryFacetInterface = new ethers.utils.Interface(
    InitParcelsRolesRegistryFacet__factory.abi
  ) as InitParcelsRolesRegistryFacetInterface;
  //@ts-ignore
  const payload = iface.encodeFunctionData("init", []);

  //@ts-ignore
  const joined = convertFacetAndSelectorsToString(facets);
  const args: DeployUpgradeTaskArgs = {

    diamondAddress: vars.realmDiamond,
    facetsAndAddSelectors: joined,
    useLedger: false,
    useMultisig: false,
    initCalldata: payload,
    initAddress: vars.realmDiamond,

  };

  await run("deployUpgrade", args);
  
  await removeInitParcelsItemsRolesRegistryFacet();
}

async function removeInitParcelsItemsRolesRegistryFacet() {
  const vars = await varsForNetwork(ethers);
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName:
        "contracts/RealmDiamond/init/InitParcelsRolesRegistryFacet.sol:InitParcelsRolesRegistryFacet",
      addSelectors: [],
      removeSelectors: ["function init() external"],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);
  const args: DeployUpgradeTaskArgs = {
    diamondAddress: vars.realmDiamond,
    facetsAndAddSelectors: joined,
    useLedger: false,
    useMultisig: false,
  };

  await run("deployUpgrade", args);
}

export async function upgradeParcelsRolesRegistryFacet() {
  const vars = await varsForNetwork(ethers);
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "contracts/Aavegotchi/facets/ParcelRolesRegistryFacet.sol:ParcelRolesRegistryFacet",
      addSelectors: [],
      removeSelectors: [],
    },
  ];

  //@ts-ignore
  const joined = convertFacetAndSelectorsToString(facets);

  const args: DeployUpgradeTaskArgs = {
    diamondAddress: vars.realmDiamond,
    facetsAndAddSelectors: joined,
    useLedger: false,
    useMultisig: false,
  };

  await run("deployUpgrade", args);
}
