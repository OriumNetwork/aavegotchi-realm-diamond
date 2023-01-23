import { LedgerSigner } from "@anders-t/ethers-ledger";
import { BigNumber } from "ethers";
import { ethers, network } from "hardhat";
import { varsForNetwork } from "../../constants";
import { ERC20 } from "../../typechain";
import { generateLeaderboard } from "./generateLeaderboard";

async function main() {
  //change to deployer wallet
  const owner = "0x080b5bf8f360f624628e0fb961f4e67c9e3c7cf1";
  let signer;
  const testing = ["hardhat", "localhost"].includes(network.name);

  if (testing) {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [owner],
    });

    await network.provider.request({
      method: "hardhat_setBalance",
      params: [owner, "0x1000000000000000"],
    });

    signer = await ethers.getSigner(owner);
  } else if (network.name === "matic") {
    signer = new LedgerSigner(ethers.provider, "hid", "m/44'/60'/2'/0/0");
  } else {
    throw Error("Incorrect network selected");
  }

  const vars = await varsForNetwork(ethers);

  const alchemicaFacet = await ethers.getContractAt(
    "AlchemicaFacet",
    vars.realmDiamond,
    signer
  );

  // get Leaderboard with ghst to withdraw
  // set time from and interval
  let timeFrom = 1673827200;
  let interval = "week";
  const leaderboard = await generateLeaderboard(timeFrom, interval);
  let winners = leaderboard.filter((e) => e.ghstReward > 0);
  if (winners.length == 0) {
    return;
  }

  let allTokens = winners.map((e) => [vars.ghst]);
  let allAmounts = winners.map((e) => [
    ethers.utils.parseUnits(e.ghstReward.toString(), 18).toString(),
  ]);
  let allAddresses = winners.map((e) => e.account);

  const ghst = (await ethers.getContractAt(
    "ERC20",
    vars.ghst,
    signer
  )) as ERC20;
  let bal = await ghst.balanceOf(owner);
  console.log("Before balance:", ethers.utils.formatEther(bal));

  let totalPayout = BigNumber.from(0);
  for (let i = 0; i < allAmounts.length; i++) {
    const element = allAmounts[i];
    const amount = BigNumber.from(element[0]);
    totalPayout = totalPayout.add(amount);
  }

  console.log("total payout:", ethers.utils.formatEther(totalPayout));
  //Payout should be 20,000 GHST per round
  if (ethers.utils.formatEther(totalPayout) !== "20000.0") {
    throw new Error("Incorrect payout!");
  }

  console.log("Approving");
  let tx = await ghst.approve(vars.realmDiamond, ethers.constants.MaxUint256);
  await tx.wait();

  tx = await alchemicaFacet.batchTransferTokens(
    allTokens,
    allAmounts,
    allAddresses
  );

  bal = await ghst.balanceOf(owner);
  console.log("After balance:", ethers.utils.formatEther(bal));

  let receipt = await tx.wait();
  console.log("Gas used:", receipt.gasUsed);
  if (!receipt.status) {
    throw Error(`Error:: ${tx.hash}`);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
