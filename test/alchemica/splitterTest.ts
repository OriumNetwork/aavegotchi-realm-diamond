import { maticRealmDiamondAddress } from "../../scripts/tile/helperFunctions";
import { artifacts, ethers, network } from "hardhat";
import { expect } from "chai";
import {
  AlchemicaFacet,
  ParcelRolesRegistryFacet,
} from "../../typechain-types";

import {
  impersonate,
  maticAavegotchiDiamondAddress,
} from "../../scripts/helperFunctions";

import { AavegotchiDiamond, TestAlchemicaFacet } from "../../typechain-types";
import { BigNumber, Contract, ContractReceipt, Signer } from "ethers";
import { upgradeRealmTest } from "../../scripts/alchemica/test/upgrade-testAlchemica";
import { upgradeBurnKinship } from "../../scripts/alchemica/upgrades/upgrade-burnKinship";
import { log } from "console";
import { constructPermissionsBitMap } from "../../scripts/realm/LendingPermissionHelpers";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import { deployParcelsRolesRegistryFacet } from "../realm/RolesRegistryFacet/deployTest";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Testing kinship Burning ", async function () {
  const ONE_DAY = 60 * 60 * 24;
  //lending channeling
  const lentGotchiId = "3410";
  const parcelId = "21688";

  const ROLE_ALCHEMICA_CHANNELING = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("AlchemicaChanneling()")
  );

  const ROLE_EMPTY_RESERVOIR = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("EmptyReservoir()")
  );

  //direct channeling
  const gotchiId2 = "17021";
  const parcelId2 = "25355";
  const realmDiamondAddress = "0x1D0360BaC7299C86Ec8E99d0c1C9A95FEfaF2a11";
  const ownerParcel = "0xe1A077b679F206073d85c3a62258F0E7ce3C9630";

  let snapshotId: string;
  let owner: SignerWithAddress;
  let testAlchemicaFacet: TestAlchemicaFacet;
  let aFacet: AavegotchiDiamond;
  let alchemicaFacet: AlchemicaFacet;
  let parcelRolesRegistryFacet: Contract;
  let testContract: Contract;
  let mockERC20: Contract;
  let mockERC721: Contract;
  let recipient1: SignerWithAddress;
  let recipient2: SignerWithAddress;
  let borrower: SignerWithAddress;
  let ownerParcelSigner: Signer;
  let splitterContract: Contract;
  let splitterSigner;
  Signer;

  before(async function () {
    await helpers.mine();
    this.timeout(20000000);

    const ROLE_ALCHEMICA_CHANNELING = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("AlchemicaChanneling()")
    );

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [ownerParcel],
    });

    await helpers.setBalance(ownerParcel, ethers.utils.parseEther("10"));

    ownerParcelSigner = ethers.provider.getSigner(ownerParcel);

    const signers = await ethers.getSigners();
    owner = signers[0];
    recipient1 = signers[1];
    recipient2 = signers[2];
    borrower = signers[10];

    const artifact = await artifacts.readArtifact("ERC20Generic");
    const runtimeBytecode = artifact.deployedBytecode;

    const code = await ethers.provider.getCode(
      "0xC60DCd56d8339fb9F914B9BFCb70D8028E9A55e2"
    );

    await network.provider.request({
      method: "hardhat_setCode",
      params: ["0xC60DCd56d8339fb9F914B9BFCb70D8028E9A55e2", runtimeBytecode],
    });

    const MockERC20 = await ethers.getContractFactory("ERC20Generic");

    mockERC20 = MockERC20.attach("0xC60DCd56d8339fb9F914B9BFCb70D8028E9A55e2");

    const SplitterContract = await ethers.getContractFactory("ERC20Splitter");
    splitterContract = await SplitterContract.deploy();
    await splitterContract.deployed();

    await upgradeRealmTest();
    await upgradeBurnKinship();

    aFacet = (await ethers.getContractAt(
      "AavegotchiDiamond",
      maticAavegotchiDiamondAddress
    )) as AavegotchiDiamond;

    testAlchemicaFacet = (await ethers.getContractAt(
      "TestAlchemicaFacet",
      maticRealmDiamondAddress
    )) as TestAlchemicaFacet;

    alchemicaFacet = (await ethers.getContractAt(
      "AlchemicaFacet",
      maticRealmDiamondAddress
    )) as AlchemicaFacet;

    parcelRolesRegistryFacet = (await ethers.getContractAt(
      "ParcelRolesRegistryFacet",
      maticRealmDiamondAddress
    )) as ParcelRolesRegistryFacet;

    await deployParcelsRolesRegistryFacet(
      realmDiamondAddress,
      parcelRolesRegistryFacet.address,
      parcelId2,
      ownerParcel,
      splitterContract.address
    );

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [parcelRolesRegistryFacet.address],
    });

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [splitterContract.address],
    });

    await network.provider.send("hardhat_setBalance", [
      splitterContract.address,
      ethers.utils.hexValue(ethers.utils.parseEther("3")), // Convertendo 2 Ether para hex
    ]);

    const parcelRolesRegistrySigner = ethers.provider.getSigner(
      parcelRolesRegistryFacet.address
    );

    splitterSigner = ethers.provider.getSigner(splitterContract.address);

    await mockERC20
      .connect(parcelRolesRegistrySigner)
      .mint(ethers.utils.parseEther("1000"));

    await mockERC20
      .connect(parcelRolesRegistrySigner)
      .approve(splitterContract.address, ethers.utils.parseEther("1000"));

    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [parcelRolesRegistryFacet.address],
    });

    const realmContract = await ethers.getContractAt(
      "ERC721",
      realmDiamondAddress
    );
    const realmContractWithSigner = realmContract.connect(ownerParcelSigner);

    await realmContractWithSigner.approve(
      parcelRolesRegistryFacet.address,
      parcelId2
    );

    await realmContractWithSigner.setApprovalForAll(realmDiamondAddress, true);

    await realmContract
      .connect(ownerParcelSigner)
      .approve(parcelRolesRegistryFacet.address, parcelId2);
    await realmContract
      .connect(ownerParcelSigner)
      .setApprovalForAll(parcelRolesRegistryFacet.address, true);

    const isApprovedForAll = await realmContract.isApprovedForAll(
      ownerParcel,
      parcelRolesRegistryFacet.address
    );
    console.log("Approved for all:", isApprovedForAll);

    const approvedAddress = await realmContract.getApproved(parcelId2);
    console.log("Approved address:", approvedAddress);
  });

  beforeEach(async function () {
    snapshotId = await network.provider.send("evm_snapshot");
  });

  afterEach(async function () {
    await network.provider.send("evm_revert", [snapshotId]);
  });

  it("Test spplitter contract values ", async function () {
    const tokenAddresses = [mockERC20.address];
    const ownerShares = [3000];
    const borrowerShares = [4000];
    const shares = [[1500, 1500]];
    const recipients = [[recipient1.address, recipient2.address]];

    const encodedData = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint16[]", "uint16[]", "uint16[][]", "address[][]"],
      [tokenAddresses, ownerShares, borrowerShares, shares, recipients]
    );

    let roleWithProfitShare = {
      roleId: ROLE_EMPTY_RESERVOIR,
      tokenAddress: realmDiamondAddress,
      tokenId: parcelId2,
      recipient: borrower.address,
      expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
      revocable: true,
      data: encodedData,
    };

    await expect(
      parcelRolesRegistryFacet
        .connect(ownerParcelSigner)
        .grantRole(roleWithProfitShare)
    )
      .to.emit(parcelRolesRegistryFacet, "RoleGranted")
      .withArgs(
        roleWithProfitShare.tokenAddress,
        roleWithProfitShare.tokenId,
        roleWithProfitShare.roleId,
        ownerParcel,
        roleWithProfitShare.recipient,
        roleWithProfitShare.expirationDate,
        roleWithProfitShare.revocable,
        roleWithProfitShare.data
      );

    await parcelRolesRegistryFacet.setExpirationDate(
      tokenAddresses[0],
      roleWithProfitShare.tokenId,
      roleWithProfitShare.roleId,
      roleWithProfitShare.expirationDate
    );

    const kinshipBefore = await aFacet.kinship(gotchiId2);
    const lastChanneled = await alchemicaFacet.getLastChanneled(gotchiId2);

    await testAlchemicaFacet
      .connect(borrower)
      .MockclaimAvailableAlchemica(parcelId2, gotchiId2);

    const ownerBalance = await splitterContract.balances(
      mockERC20.address,
      ownerParcel
    );
    const recipient1Balance = await splitterContract.balances(
      mockERC20.address,
      recipient1.address
    );
    const recipient2Balance = await splitterContract.balances(
      mockERC20.address,
      recipient2.address
    );

    console.log("Owner Balance", ownerBalance.toString());
    console.log("Recipient1 Balance", recipient1Balance.toString());
    console.log("Recipient2 Balance", recipient2Balance.toString());

    expect(ownerBalance).to.equal(
      ethers.utils.parseEther("1.574999999999999889")
    );
    expect(recipient1Balance).to.equal(
      ethers.utils.parseEther("0.787499999999999944")
    );
    expect(recipient2Balance).to.equal(
      ethers.utils.parseEther("0.787499999999999944")
    );
  });

  it("Test Owner withdraw function", async function () {
    const tokenAddresses = [mockERC20.address];
    const ownerShares = [3000];
    const borrowerShares = [4000];
    const shares = [[1500, 1500]];
    const recipients = [[recipient1.address, recipient2.address]];

    const encodedData = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint16[]", "uint16[]", "uint16[][]", "address[][]"],
      [tokenAddresses, ownerShares, borrowerShares, shares, recipients]
    );

    let roleWithProfitShare = {
      roleId: ROLE_EMPTY_RESERVOIR,
      tokenAddress: realmDiamondAddress,
      tokenId: parcelId2,
      recipient: borrower.address,
      expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
      revocable: true,
      data: encodedData,
    };

    await expect(
      parcelRolesRegistryFacet
        .connect(ownerParcelSigner)
        .grantRole(roleWithProfitShare)
    )
      .to.emit(parcelRolesRegistryFacet, "RoleGranted")
      .withArgs(
        roleWithProfitShare.tokenAddress,
        roleWithProfitShare.tokenId,
        roleWithProfitShare.roleId,
        ownerParcel,
        roleWithProfitShare.recipient,
        roleWithProfitShare.expirationDate,
        roleWithProfitShare.revocable,
        roleWithProfitShare.data
      );

    await parcelRolesRegistryFacet.setExpirationDate(
      tokenAddresses[0],
      roleWithProfitShare.tokenId,
      roleWithProfitShare.roleId,
      roleWithProfitShare.expirationDate
    );
    await testAlchemicaFacet
      .connect(borrower)
      .MockclaimAvailableAlchemica(parcelId2, gotchiId2);

    const tokenAddress = mockERC20.address;
    const user = ownerParcel;
    const userSigner = ownerParcelSigner;

    const userInitialERC20Balance = await mockERC20.balanceOf(user);
    console.log(
      "User Initial ERC20 Balance:",
      ethers.utils.formatEther(userInitialERC20Balance)
    );

    const userSplitterBalance = await splitterContract.balances(
      tokenAddress,
      user
    );
    console.log(
      "User Splitter Balance:",
      ethers.utils.formatEther(userSplitterBalance)
    );

    const splitterInitialBalance = await mockERC20.balanceOf(
      splitterContract.address
    );
    console.log(
      "Splitter Initial Balance:",
      ethers.utils.formatEther(splitterInitialBalance)
    );

    const splitterFinalBalanceBeforeWithdraw = await mockERC20.balanceOf(
      splitterContract.address
    );
    console.log(
      "Splitter Balance Before Withdraw:",
      ethers.utils.formatEther(splitterFinalBalanceBeforeWithdraw)
    );

    await mockERC20
      .connect(splitterSigner)
      .approve(splitterContract.address, ethers.utils.parseEther("1000"));

    await splitterContract.connect(userSigner).withdraw([tokenAddress]);

    const userFinalERC20Balance = await mockERC20.balanceOf(user);
    console.log(
      "User Final ERC20 Balance:",
      ethers.utils.formatEther(userFinalERC20Balance)
    );

    const userSplitterBalanceAfter = await splitterContract.balances(
      tokenAddress,
      user
    );
    console.log(
      "User Splitter Balance After Withdraw:",
      ethers.utils.formatEther(userSplitterBalanceAfter)
    );

    const userSplitterRecipient1 = await splitterContract.balances(
      tokenAddress,
      recipient1.address
    );
    console.log(
      "Recipient 1 Splitter Balance After Withdraw:",
      ethers.utils.formatEther(userSplitterRecipient1)
    );

    const splitterFinalBalance = await mockERC20.balanceOf(
      splitterContract.address
    );
    console.log(
      "Splitter Final Balance:",
      ethers.utils.formatEther(splitterFinalBalance)
    );

    expect(userSplitterBalanceAfter).to.equal(0);
  });

  it("Test Recipient1 withdraw function", async function () {
    const tokenAddresses = [mockERC20.address];
    const ownerShares = [3000];
    const borrowerShares = [4000];
    const shares = [[1500, 1500]];
    const recipients = [[recipient1.address, recipient2.address]];

    const encodedData = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint16[]", "uint16[]", "uint16[][]", "address[][]"],
      [tokenAddresses, ownerShares, borrowerShares, shares, recipients]
    );

    let roleWithProfitShare = {
      roleId: ROLE_EMPTY_RESERVOIR,
      tokenAddress: realmDiamondAddress,
      tokenId: parcelId2,
      recipient: borrower.address,
      expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
      revocable: true,
      data: encodedData,
    };

    await expect(
      parcelRolesRegistryFacet
        .connect(ownerParcelSigner)
        .grantRole(roleWithProfitShare)
    )
      .to.emit(parcelRolesRegistryFacet, "RoleGranted")
      .withArgs(
        roleWithProfitShare.tokenAddress,
        roleWithProfitShare.tokenId,
        roleWithProfitShare.roleId,
        ownerParcel,
        roleWithProfitShare.recipient,
        roleWithProfitShare.expirationDate,
        roleWithProfitShare.revocable,
        roleWithProfitShare.data
      );

    await parcelRolesRegistryFacet.setExpirationDate(
      tokenAddresses[0],
      roleWithProfitShare.tokenId,
      roleWithProfitShare.roleId,
      roleWithProfitShare.expirationDate
    );
    await testAlchemicaFacet
      .connect(borrower)
      .MockclaimAvailableAlchemica(parcelId2, gotchiId2);

    const tokenAddress = mockERC20.address;
    const user = ownerParcel;

    const userInitialERC20Balance = await mockERC20.balanceOf(user);
    console.log(
      "User Initial ERC20 Balance:",
      ethers.utils.formatEther(userInitialERC20Balance)
    );

    const userSplitterBalance = await splitterContract.balances(
      tokenAddress,
      user
    );
    console.log(
      "User Splitter Balance:",
      ethers.utils.formatEther(userSplitterBalance)
    );

    const splitterInitialBalance = await mockERC20.balanceOf(
      splitterContract.address
    );
    console.log(
      "Splitter Initial Balance:",
      ethers.utils.formatEther(splitterInitialBalance)
    );

    const splitterFinalBalanceBeforeWithdraw = await mockERC20.balanceOf(
      splitterContract.address
    );
    console.log(
      "Splitter Balance Before Withdraw:",
      ethers.utils.formatEther(splitterFinalBalanceBeforeWithdraw)
    );

    await mockERC20
      .connect(splitterSigner)
      .approve(splitterContract.address, ethers.utils.parseEther("1000"));

    await splitterContract.connect(recipient1).withdraw([tokenAddress]);

    const userFinalERC20Balance = await mockERC20.balanceOf(recipient1.address);
    console.log(
      "User Final ERC20 Balance:",
      ethers.utils.formatEther(userFinalERC20Balance)
    );

    const userSplitterBalanceAfter = await splitterContract.balances(
      tokenAddress,
      recipient1.address
    );
    console.log(
      "User Splitter Balance After Withdraw:",
      ethers.utils.formatEther(userSplitterBalanceAfter)
    );

    const splitterFinalBalance = await mockERC20.balanceOf(
      splitterContract.address
    );
    console.log(
      "Splitter Final Balance:",
      ethers.utils.formatEther(splitterFinalBalance)
    );

    expect(userSplitterBalanceAfter).to.equal(0);
  });

  it("Test Recipient2 withdraw function", async function () {
    const tokenAddresses = [mockERC20.address];
    const ownerShares = [3000];
    const borrowerShares = [4000];
    const shares = [[1500, 1500]];
    const recipients = [[recipient1.address, recipient2.address]];

    const encodedData = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint16[]", "uint16[]", "uint16[][]", "address[][]"],
      [tokenAddresses, ownerShares, borrowerShares, shares, recipients]
    );

    let roleWithProfitShare = {
      roleId: ROLE_EMPTY_RESERVOIR,
      tokenAddress: realmDiamondAddress,
      tokenId: parcelId2,
      recipient: borrower.address,
      expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
      revocable: true,
      data: encodedData,
    };

    await expect(
      parcelRolesRegistryFacet
        .connect(ownerParcelSigner)
        .grantRole(roleWithProfitShare)
    )
      .to.emit(parcelRolesRegistryFacet, "RoleGranted")
      .withArgs(
        roleWithProfitShare.tokenAddress,
        roleWithProfitShare.tokenId,
        roleWithProfitShare.roleId,
        ownerParcel,
        roleWithProfitShare.recipient,
        roleWithProfitShare.expirationDate,
        roleWithProfitShare.revocable,
        roleWithProfitShare.data
      );

    await parcelRolesRegistryFacet.setExpirationDate(
      tokenAddresses[0],
      roleWithProfitShare.tokenId,
      roleWithProfitShare.roleId,
      roleWithProfitShare.expirationDate
    );
    await testAlchemicaFacet
      .connect(borrower)
      .MockclaimAvailableAlchemica(parcelId2, gotchiId2);

    const tokenAddress = mockERC20.address;
    const user = ownerParcel;

    const userInitialERC20Balance = await mockERC20.balanceOf(user);
    console.log(
      "User Initial ERC20 Balance:",
      ethers.utils.formatEther(userInitialERC20Balance)
    );

    const userSplitterBalance = await splitterContract.balances(
      tokenAddress,
      user
    );
    console.log(
      "User Splitter Balance:",
      ethers.utils.formatEther(userSplitterBalance)
    );

    const splitterInitialBalance = await mockERC20.balanceOf(
      splitterContract.address
    );
    console.log(
      "Splitter Initial Balance:",
      ethers.utils.formatEther(splitterInitialBalance)
    );

    const splitterFinalBalanceBeforeWithdraw = await mockERC20.balanceOf(
      splitterContract.address
    );
    console.log(
      "Splitter Balance Before Withdraw:",
      ethers.utils.formatEther(splitterFinalBalanceBeforeWithdraw)
    );

    await mockERC20
      .connect(splitterSigner)
      .approve(splitterContract.address, ethers.utils.parseEther("1000"));

    await splitterContract.connect(recipient2).withdraw([tokenAddress]);

    const userFinalERC20Balance = await mockERC20.balanceOf(recipient2.address);
    console.log(
      "User Final ERC20 Balance:",
      ethers.utils.formatEther(userFinalERC20Balance)
    );

    const userSplitterBalanceAfter = await splitterContract.balances(
      tokenAddress,
      recipient2.address
    );
    console.log(
      "User Splitter Balance After Withdraw:",
      ethers.utils.formatEther(userSplitterBalanceAfter)
    );

    const splitterFinalBalance = await mockERC20.balanceOf(
      splitterContract.address
    );
    console.log(
      "Splitter Final Balance:",
      ethers.utils.formatEther(splitterFinalBalance)
    );

    expect(userSplitterBalanceAfter).to.equal(0);
  });

  it("Test Recipient2 withdraw function with ERC20 and ETH", async function () {
    const tokenAddresses = [mockERC20.address, ethers.constants.AddressZero]; // ERC20 and ETH
    const ownerShares = [3000, 3000]; // Owner shares for both ERC20 and ETH
    const borrowerShares = [4000, 4000]; // Borrower shares for both ERC20 and ETH
    const shares = [
      [1500, 1500], // Shares for recipients for ERC20
      [1500, 1500], // Shares for recipients for ETH
    ];
    const recipients = [
      [recipient1.address, recipient2.address], // Recipients for ERC20
      [recipient1.address, recipient2.address], // Recipients for ETH
    ];

    const encodedData = ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint16[]", "uint16[]", "uint16[][]", "address[][]"],
      [tokenAddresses, ownerShares, borrowerShares, shares, recipients]
    );

    let roleWithProfitShare = {
      roleId: ROLE_EMPTY_RESERVOIR,
      tokenAddress: realmDiamondAddress,
      tokenId: parcelId2,
      recipient: borrower.address,
      expirationDate: Math.floor(Date.now() / 1000) + ONE_DAY,
      revocable: true,
      data: encodedData,
    };

    await expect(
      parcelRolesRegistryFacet
        .connect(ownerParcelSigner)
        .grantRole(roleWithProfitShare)
    )
      .to.emit(parcelRolesRegistryFacet, "RoleGranted")
      .withArgs(
        roleWithProfitShare.tokenAddress,
        roleWithProfitShare.tokenId,
        roleWithProfitShare.roleId,
        ownerParcel,
        roleWithProfitShare.recipient,
        roleWithProfitShare.expirationDate,
        roleWithProfitShare.revocable,
        roleWithProfitShare.data
      );

    await parcelRolesRegistryFacet.setExpirationDate(
      tokenAddresses[0],
      roleWithProfitShare.tokenId,
      roleWithProfitShare.roleId,
      roleWithProfitShare.expirationDate
    );

    await testAlchemicaFacet
      .connect(borrower)
      .MockclaimAvailableAlchemica(parcelId2, gotchiId2);

    await mockERC20
      .connect(splitterSigner)
      .approve(splitterContract.address, ethers.utils.parseEther("1000"));

    await splitterContract
      .connect(recipient2)
      .withdraw([mockERC20.address, ethers.constants.AddressZero]);

    const recipient2ERC20Balance = await mockERC20.balanceOf(
      recipient2.address
    );
    const recipient2ETHBalance = await ethers.provider.getBalance(
      recipient2.address
    );
    const splitterFinalBalanceERC20 = await mockERC20.balanceOf(
      splitterContract.address
    );
    const splitterFinalBalanceETH = await ethers.provider.getBalance(
      splitterContract.address
    );

    console.log(
      "Recipient2 Final ERC20 Balance:",
      ethers.utils.formatEther(recipient2ERC20Balance)
    );
    console.log(
      "Recipient2 Final ETH Balance:",
      ethers.utils.formatEther(recipient2ETHBalance)
    );
    console.log(
      "Splitter Final ERC20 Balance:",
      ethers.utils.formatEther(splitterFinalBalanceERC20)
    );
    console.log(
      "Splitter Final ETH Balance:",
      ethers.utils.formatEther(splitterFinalBalanceETH)
    );

    expect(
      await splitterContract.balances(mockERC20.address, recipient2.address)
    ).to.equal(0);
    expect(
      await splitterContract.balances(
        ethers.constants.AddressZero,
        recipient2.address
      )
    ).to.equal(0);
  });
});

interface LogEvent {
  topics: string[];
  data: string;
}

interface IGotchiLending {
  listingId: string;
  lender: string;
  tokenId: BigNumber;
  initialCost: BigNumber;
  period: number;
  revenueSplit: [BigNumber, BigNumber, BigNumber];
  originalOwner: string;
  thirdParty: string;
  whitelistId: BigNumber;
  revenueTokens: string[];
  timeCancelled?: BigNumber;
  timeEnded?: BigNumber;
  timeClaimed?: BigNumber;
  timeAgreed?: BigNumber;
  timeCreated?: BigNumber;
  borrower?: string;
  channellingStatus: BigNumber;
}

function parse(e: LogEvent, abi: string[]) {
  let iface = new ethers.utils.Interface(abi);

  return iface.parseLog(e).args;
}

const gAdd = [
  `event GotchiLendingAdded((uint32 listingId,address lender,uint32 tokenId,uint96 initialCost,uint32 period,uint8[3] revenueSplit,address originalOwner,address thirdParty,uint32 whitelistId,address[] revenueTokens,uint256 timeCreated,uint256 channellingStatus))`,
];

function getNewListingId(receipt: ContractReceipt) {
  let pItems: IGotchiLending[] = [];
  const data = receipt.events![receipt.events!.length - 1];

  const ev = {
    topics: data.topics,
    data: data.data,
  };
  pItems = parse(ev, gAdd) as IGotchiLending[];
  return pItems[0].listingId;
}
