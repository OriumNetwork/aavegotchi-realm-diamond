/* eslint-disable no-unexpected-multiline */
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ERC20Generic, ERC20Splitter } from "../../../typechain-types";

describe("ERC20Splitter", () => {
  let splitter: ERC20Splitter;
  let mockERC20: ERC20Generic;
  let owner: Awaited<ReturnType<typeof ethers.getSigner>>;
  let recipient1: Awaited<ReturnType<typeof ethers.getSigner>>;
  let recipient2: Awaited<ReturnType<typeof ethers.getSigner>>;
  let recipient3: Awaited<ReturnType<typeof ethers.getSigner>>;
  const AddressZero = ethers.constants.AddressZero;

  // Token and ETH split values
  const tokenAmount = ethers.utils.parseEther("100");
  const ethAmount = ethers.utils.parseEther("1");

  before(async function () {
    [owner, recipient1, recipient2, recipient3] = await ethers.getSigners();
  });

  async function deploySplitterContracts() {
    const MockERC20 = await ethers.getContractFactory("ERC20Generic");
    const ERC20Splitter = await ethers.getContractFactory("ERC20Splitter");

    const mockERC20 = await MockERC20.deploy();
    await mockERC20.deployed();

    const splitter = await ERC20Splitter.deploy();
    await splitter.deployed();

    return { mockERC20, splitter };
  }

  beforeEach(async () => {
    const contracts = await loadFixture(deploySplitterContracts);
    mockERC20 = contracts.mockERC20;
    splitter = contracts.splitter;

    // Mint tokens to the owner
    await mockERC20.connect(owner).mint(ethers.utils.parseEther("1000"));
  });

  describe("Main Functions", async () => {
    describe("Deposit", async () => {
      beforeEach(async () => {
        // Approve tokens for the splitter contract
        await mockERC20.connect(owner).approve(splitter.address, tokenAmount);
      });

      it("Should deposit ERC20 tokens and split them between recipients", async () => {
        const shares = [[5000, 3000, 2000]]; // 50%, 30%, 20%
        const recipients = [
          [recipient1.address, recipient2.address, recipient3.address],
        ];

        await expect(
          splitter
            .connect(owner)
            .deposit([mockERC20.address], [tokenAmount], shares, recipients)
        ).to.emit(splitter, "Deposit");

        // Check balances
        expect(
          await splitter.balances(mockERC20.address, recipient1.address)
        ).to.equal(ethers.utils.parseEther("50"));
        expect(
          await splitter.balances(mockERC20.address, recipient2.address)
        ).to.equal(ethers.utils.parseEther("30"));
        expect(
          await splitter.balances(mockERC20.address, recipient3.address)
        ).to.equal(ethers.utils.parseEther("20"));
      });

      it("Should deposit native tokens (ETH) and split them between recipients", async () => {
        const shares = [[5000, 3000, 2000]]; // 50%, 30%, 20%
        const recipients = [
          [recipient1.address, recipient2.address, recipient3.address],
        ];

        await expect(
          splitter
            .connect(owner)
            .deposit([AddressZero], [ethAmount], shares, recipients, {
              value: ethAmount,
            })
        ).to.emit(splitter, "Deposit");

        // Check balances
        expect(
          await splitter.balances(AddressZero, recipient1.address)
        ).to.equal(ethers.utils.parseEther("0.5"));
        expect(
          await splitter.balances(AddressZero, recipient2.address)
        ).to.equal(ethers.utils.parseEther("0.3"));
        expect(
          await splitter.balances(AddressZero, recipient3.address)
        ).to.equal(ethers.utils.parseEther("0.2"));
      });

      it("Should revert if shares do not sum to 100%", async () => {
        const invalidShares = [[4000, 4000, 1000]]; // Sums to 90%
        const recipients = [
          [recipient1.address, recipient2.address, recipient3.address],
        ];

        await expect(
          splitter
            .connect(owner)
            .deposit(
              [mockERC20.address],
              [tokenAmount],
              invalidShares,
              recipients
            )
        ).to.be.revertedWith("Shares must sum to 100%");
      });

      it("Should revert if the number of shares and recipients do not match", async () => {
        const invalidShares = [[5000, 3000]]; // Only 2 shares
        const recipients = [
          [recipient1.address, recipient2.address, recipient3.address],
        ]; // 3 recipients

        await expect(
          splitter
            .connect(owner)
            .deposit(
              [mockERC20.address],
              [tokenAmount],
              invalidShares,
              recipients
            )
        ).to.be.revertedWith("Shares and recipients length mismatch");
      });
    });

    describe("Withdraw", async () => {
      beforeEach(async () => {
        // Deposit tokens before testing withdrawals
        const shares = [[5000, 3000, 2000]];
        const recipients = [
          [recipient1.address, recipient2.address, recipient3.address],
        ];

        await mockERC20.connect(owner).approve(splitter.address, tokenAmount);
        await splitter
          .connect(owner)
          .deposit([mockERC20.address], [tokenAmount], shares, recipients);
      });

      it("Should allow a recipient to withdraw their split ERC20 tokens without specifying token addresses", async () => {
        await expect(splitter.connect(recipient1).withdraw())
          .to.emit(splitter, "Withdraw")
          .withArgs(
            recipient1.address,
            mockERC20.address,
            ethers.utils.parseEther("50")
          );

        expect(
          await splitter.balances(mockERC20.address, recipient1.address)
        ).to.equal(0);
      });

      it("Should allow a recipient to withdraw their split native tokens (ETH) without specifying token addresses", async () => {
        const shares = [[5000, 3000, 2000]];
        const recipients = [
          [recipient1.address, recipient2.address, recipient3.address],
        ];

        await splitter
          .connect(owner)
          .deposit([AddressZero], [ethAmount], shares, recipients, {
            value: ethAmount,
          });

        await expect(splitter.connect(recipient1).withdraw())
          .to.emit(splitter, "Withdraw")
          .withArgs(
            recipient1.address,
            AddressZero,
            ethers.utils.parseEther("0.5")
          );

        expect(
          await splitter.balances(AddressZero, recipient1.address)
        ).to.equal(0);
      });
    });
  });
});
