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
          await splitter._balances(mockERC20.address, recipient1.address)
        ).to.equal(ethers.utils.parseEther("50"));
        expect(
          await splitter._balances(mockERC20.address, recipient2.address)
        ).to.equal(ethers.utils.parseEther("30"));
        expect(
          await splitter._balances(mockERC20.address, recipient3.address)
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
          await splitter._balances(AddressZero, recipient1.address)
        ).to.equal(ethers.utils.parseEther("0.5"));
        expect(
          await splitter._balances(AddressZero, recipient2.address)
        ).to.equal(ethers.utils.parseEther("0.3"));
        expect(
          await splitter._balances(AddressZero, recipient3.address)
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
            [mockERC20.address],
            [ethers.utils.parseEther("50")]
          );

        expect(
          await splitter._balances(mockERC20.address, recipient1.address)
        ).to.equal(0);
      });

      it("Should allow a recipient to withdraw their split native tokens (ETH) and ERC20 tokens", async () => {
        const shares = [[5000, 3000, 2000]];
        const recipients = [
          [recipient1.address, recipient2.address, recipient3.address],
        ];

        // Then deposit native tokens (ETH)
        await splitter
          .connect(owner)
          .deposit([AddressZero], [ethAmount], shares, recipients, {
            value: ethAmount,
          });

        // Withdraw for recipient1, expecting ERC20 tokens first
        await expect(splitter.connect(recipient1).withdraw())
          .to.emit(splitter, "Withdraw")
          .withArgs(
            recipient1.address,
            [mockERC20.address, AddressZero], // Expect both ERC-20 and native token
            [ethers.utils.parseEther("50"), ethers.utils.parseEther("0.5")] // 50 ERC20 tokens and 0.5 ETH
          );

        // Check that the balances are updated correctly
        expect(
          await splitter._balances(AddressZero, recipient1.address)
        ).to.equal(0);
        expect(
          await splitter._balances(mockERC20.address, recipient1.address)
        ).to.equal(0);
      });
    });
    describe("Withdraw ERC-20 and Native Tokens", async () => {
      beforeEach(async () => {
        // Deposit ERC-20 tokens before testing withdrawals
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
            [mockERC20.address],
            [ethers.utils.parseEther("50")]
          );

        expect(
          await splitter._balances(mockERC20.address, recipient1.address)
        ).to.equal(0);
      });

      it("Should allow a recipient to withdraw their split native tokens (ETH) and ERC20 tokens", async () => {
        const shares = [[5000, 3000, 2000]];
        const recipients = [
          [recipient1.address, recipient2.address, recipient3.address],
        ];

        // Then deposit native tokens (ETH)
        await splitter
          .connect(owner)
          .deposit([AddressZero], [ethAmount], shares, recipients, {
            value: ethAmount,
          });

        // Withdraw for recipient1, expecting both ERC20 and ETH
        await expect(splitter.connect(recipient1).withdraw())
          .to.emit(splitter, "Withdraw")
          .withArgs(
            recipient1.address,
            [mockERC20.address, AddressZero], // Expect both ERC-20 and native token
            [ethers.utils.parseEther("50"), ethers.utils.parseEther("0.5")] // 50 ERC20 tokens and 0.5 ETH
          );

        // Check that the balances are updated correctly
        expect(
          await splitter._balances(AddressZero, recipient1.address)
        ).to.equal(0);
        expect(
          await splitter._balances(mockERC20.address, recipient1.address)
        ).to.equal(0);
      });
    });

    describe("Withdraw Only Native Tokens (ETH)", async () => {
      beforeEach(async () => {
        const shares = [[5000, 3000, 2000]]; // 50%, 30%, 20%
        const recipients = [
          [recipient1.address, recipient2.address, recipient3.address],
        ];

        // Deposit native tokens (ETH)
        await splitter
          .connect(owner)
          .deposit([AddressZero], [ethAmount], shares, recipients, {
            value: ethAmount,
          });
      });

      it("Should allow a recipient to withdraw only their split native tokens (ETH)", async () => {
        // Withdraw only native tokens (ETH) for recipient1
        await expect(splitter.connect(recipient1).withdraw())
          .to.emit(splitter, "Withdraw")
          .withArgs(
            recipient1.address,
            [AddressZero], // Expect only native token (ETH)
            [ethers.utils.parseEther("0.5")] // Expect 0.5 ETH (50% of 1 ETH)
          );

        // Check that the balance is updated correctly
        expect(
          await splitter._balances(AddressZero, recipient1.address)
        ).to.equal(0);
      });
    });

    describe("Deposit ETH for recipient1 and ERC-20 for other recipients", async () => {
      beforeEach(async () => {
        const ethShares = [[10000]]; // 100% for recipient1 (ETH)
        const erc20Shares = [[5000, 5000]]; // 50% for recipient2, 50% for recipient3 (ERC-20)
        const ethRecipients = [[recipient1.address]]; // Only recipient1 gets ETH
        const erc20Recipients = [
          [recipient2.address, recipient3.address], // recipient2 and recipient3 get ERC-20 tokens
        ];

        // First, deposit native tokens (ETH) for recipient1
        await splitter
          .connect(owner)
          .deposit([AddressZero], [ethAmount], ethShares, ethRecipients, {
            value: ethAmount,
          });

        // Then, deposit ERC-20 tokens for recipient2 and recipient3
        await mockERC20.connect(owner).approve(splitter.address, tokenAmount);
        await splitter
          .connect(owner)
          .deposit(
            [mockERC20.address],
            [tokenAmount],
            erc20Shares,
            erc20Recipients
          );
      });

      it("Should allow recipient1 to withdraw only their ETH and other recipients to withdraw their ERC-20 tokens", async () => {
        // recipient1 withdraws their ETH
        await expect(splitter.connect(recipient1).withdraw())
          .to.emit(splitter, "Withdraw")
          .withArgs(
            recipient1.address,
            [AddressZero], // Only native token (ETH)
            [ethers.utils.parseEther("1")] // Full 1 ETH
          );

        // Check that the balance for ETH is updated correctly
        expect(
          await splitter._balances(AddressZero, recipient1.address)
        ).to.equal(0);

        // recipient2 withdraws their ERC-20 tokens
        await expect(splitter.connect(recipient2).withdraw())
          .to.emit(splitter, "Withdraw")
          .withArgs(
            recipient2.address,
            [mockERC20.address], // Only ERC-20 token
            [ethers.utils.parseEther("50")] // 50% of ERC-20 tokens
          );

        // Check that the balance for ERC-20 is updated correctly for recipient2
        expect(
          await splitter._balances(mockERC20.address, recipient2.address)
        ).to.equal(0);

        // recipient3 withdraws their ERC-20 tokens
        await expect(splitter.connect(recipient3).withdraw())
          .to.emit(splitter, "Withdraw")
          .withArgs(
            recipient3.address,
            [mockERC20.address], // Only ERC-20 token
            [ethers.utils.parseEther("50")] // 50% of ERC-20 tokens
          );

        // Check that the balance for ERC-20 is updated correctly for recipient3
        expect(
          await splitter._balances(mockERC20.address, recipient3.address)
        ).to.equal(0);
      });
    });
  });
});
