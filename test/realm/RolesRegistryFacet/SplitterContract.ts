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
        ).to.be.revertedWith("ERC20Splitter: Shares must sum to 100%");
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
        ).to.be.revertedWith(
          "ERC20Splitter: Shares and recipients length mismatch"
        );
      });

      it("Should handle multiple native token (ETH) deposits in a single transaction", async () => {
        const ethShares = [
          [5000, 5000],
          [6000, 4000],
        ]; // 50%-50% for first ETH, 60%-40% for second ETH
        const ethRecipients1 = [recipient1.address, recipient2.address]; // Recipients for first ETH deposit
        const ethRecipients2 = [recipient2.address, recipient3.address]; // Recipients for second ETH deposit

        const ethAmount1 = ethers.utils.parseEther("1"); // First ETH deposit (1 ETH)
        const ethAmount2 = ethers.utils.parseEther("2"); // Second ETH deposit (2 ETH)

        // Perform the deposit of multiple ETH in a single transaction
        await expect(
          splitter.connect(owner).deposit(
            [AddressZero, AddressZero], // Two instances of address(0) for ETH deposits
            [ethAmount1, ethAmount2], // ETH amounts
            [ethShares[0], ethShares[1]], // Shares for both ETH deposits
            [ethRecipients1, ethRecipients2], // Recipients for both ETH deposits
            { value: ethAmount1.add(ethAmount2) } // Total ETH sent in the transaction (3 ETH)
          )
        ).to.emit(splitter, "Deposit");

        // Check balances for recipient1 (50% of 1 ETH)
        expect(
          await splitter.balances(AddressZero, recipient1.address)
        ).to.equal(ethers.utils.parseEther("0.5"));

        // Check balances for recipient2 (50% of 1 ETH + 60% of 2 ETH = 0.5 + 1.2 = 1.7 ETH)
        expect(
          await splitter.balances(AddressZero, recipient2.address)
        ).to.equal(ethers.utils.parseEther("1.7"));

        // Check balances for recipient3 (40% of 2 ETH = 0.8 ETH)
        expect(
          await splitter.balances(AddressZero, recipient3.address)
        ).to.equal(ethers.utils.parseEther("0.8"));
      });

      it("Should handle both native token (ETH) and ERC-20 deposits in a single transaction", async () => {
        const ethShares = [[5000, 5000]]; // 50%-50% for ETH deposit
        const erc20Shares = [[6000, 4000]]; // 60%-40% for ERC-20 deposit

        const ethRecipients = [recipient1.address, recipient2.address]; // Recipients for ETH deposit
        const erc20Recipients = [recipient2.address, recipient3.address]; // Recipients for ERC-20 deposit

        const ethAmount = ethers.utils.parseEther("1"); // ETH deposit (1 ETH)
        const erc20Amount = ethers.utils.parseEther("100"); // ERC-20 deposit (100 tokens)

        // Approve ERC-20 tokens for the splitter contract
        await mockERC20.connect(owner).approve(splitter.address, erc20Amount);

        // Perform the deposit of both ETH and ERC-20 in a single transaction
        await expect(
          splitter.connect(owner).deposit(
            [AddressZero, mockERC20.address], // One for ETH, one for ERC-20
            [ethAmount, erc20Amount], // ETH and ERC-20 amounts
            [ethShares[0], erc20Shares[0]], // Shares for both ETH and ERC-20 deposits
            [ethRecipients, erc20Recipients], // Recipients for both ETH and ERC-20 deposits
            { value: ethAmount } // Total ETH sent in the transaction (1 ETH)
          )
        ).to.emit(splitter, "Deposit");

        // Check balances for recipient1 (50% of 1 ETH)
        expect(
          await splitter.balances(AddressZero, recipient1.address)
        ).to.equal(ethers.utils.parseEther("0.5"));

        // Check balances for recipient2 (50% of 1 ETH + 60% of 100 ERC-20 tokens = 0.5 ETH + 60 tokens)
        expect(
          await splitter.balances(AddressZero, recipient2.address)
        ).to.equal(ethers.utils.parseEther("0.5"));
        expect(
          await splitter.balances(mockERC20.address, recipient2.address)
        ).to.equal(ethers.utils.parseEther("60"));

        // Check balances for recipient3 (40% of 100 ERC-20 tokens = 40 tokens)
        expect(
          await splitter.balances(mockERC20.address, recipient3.address)
        ).to.equal(ethers.utils.parseEther("40"));
      });
    });

    describe("Withdraw", async () => {
      beforeEach(async () => {
        // Deposit ERC-20 tokens first
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
          await splitter.balances(mockERC20.address, recipient1.address)
        ).to.equal(0);
      });

      it("Should allow a recipient to withdraw their split native tokens (ETH) and ERC20 tokens", async () => {
        const shares = [[5000, 3000, 2000]];
        const recipients = [
          [recipient1.address, recipient2.address, recipient3.address],
        ];

        // Deposit native tokens (ETH) **after** ERC-20 tokens
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
          await splitter.balances(AddressZero, recipient1.address)
        ).to.equal(0);
        expect(
          await splitter.balances(mockERC20.address, recipient1.address)
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
          await splitter.balances(mockERC20.address, recipient1.address)
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
          await splitter.balances(AddressZero, recipient1.address)
        ).to.equal(0);
        expect(
          await splitter.balances(mockERC20.address, recipient1.address)
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
          await splitter.balances(AddressZero, recipient1.address)
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
          await splitter.balances(AddressZero, recipient1.address)
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
          await splitter.balances(mockERC20.address, recipient2.address)
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
          await splitter.balances(mockERC20.address, recipient3.address)
        ).to.equal(0);
      });
    });
    describe("Withdraw for both native tokens (ETH) and ERC-20 tokens multiples addresses 0", () => {
      let ethShares, erc20Shares;
      let ethRecipients, erc20Recipients;
      let ethAmount, erc20Amount;

      beforeEach(async () => {
        // Define shares and recipients for both ETH and ERC-20
        ethShares = [[5000, 5000]]; // 50%-50% for ETH
        erc20Shares = [[6000, 4000]]; // 60%-40% for ERC-20

        ethRecipients = [recipient1.address, recipient2.address]; // Recipients for ETH
        erc20Recipients = [recipient2.address, recipient3.address]; // Recipients for ERC-20

        ethAmount = ethers.utils.parseEther("1"); // 1 ETH
        erc20Amount = ethers.utils.parseEther("100"); // 100 ERC-20 tokens

        // Approve ERC-20 tokens for the splitter contract
        await mockERC20.connect(owner).approve(splitter.address, erc20Amount);

        // Perform the deposit of both ETH and ERC-20 in one transaction
        await splitter.connect(owner).deposit(
          [AddressZero, mockERC20.address], // One for ETH, one for ERC-20
          [ethAmount, erc20Amount], // ETH and ERC-20 amounts
          [ethShares[0], erc20Shares[0]], // Shares for both deposits
          [ethRecipients, erc20Recipients], // Recipients for both deposits
          { value: ethAmount } // Total ETH sent (1 ETH)
        );
      });

      it("Should allow recipient1 to withdraw only ETH", async () => {
        // Withdraw for recipient1 (ETH only)
        await expect(splitter.connect(recipient1).withdraw())
          .to.emit(splitter, "Withdraw")
          .withArgs(
            recipient1.address,
            [AddressZero], // Only native token (ETH)
            [ethers.utils.parseEther("0.5")] // 50% of 1 ETH
          );

        // Verify balances
        expect(
          await splitter.balances(AddressZero, recipient1.address)
        ).to.equal(0);
      });

      it("Should allow recipient2 to withdraw both ETH and ERC-20 tokens", async () => {
        // Withdraw for recipient2 (ETH and ERC-20)
        await expect(splitter.connect(recipient2).withdraw())
          .to.emit(splitter, "Withdraw")
          .withArgs(
            recipient2.address,
            [AddressZero, mockERC20.address], // First ETH, then ERC-20
            [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("60")] // 50% of 1 ETH and 60 ERC-20 tokens
          );

        // Verify balances
        expect(
          await splitter.balances(AddressZero, recipient2.address)
        ).to.equal(0);
        expect(
          await splitter.balances(mockERC20.address, recipient2.address)
        ).to.equal(0);
      });

      it("Should allow recipient3 to withdraw only ERC-20 tokens", async () => {
        // Withdraw for recipient3 (ERC-20 only)
        await expect(splitter.connect(recipient3).withdraw())
          .to.emit(splitter, "Withdraw")
          .withArgs(
            recipient3.address,
            [mockERC20.address], // Only ERC-20 tokens
            [ethers.utils.parseEther("40")] // 40 ERC-20 tokens
          );

        // Verify balances
        expect(
          await splitter.balances(mockERC20.address, recipient3.address)
        ).to.equal(0);
      });
    });
  });
});
