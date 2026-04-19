import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const mockUSDC = await ethers.getContractAt(
    "MockUSDC",
    "0x5561791E7Edb27640766A38f701757952Da1ddB5"
  );

  const recipient = "0x3Cebb88aC6eA09d20Ec3Ab53D0caa77860C28184";
  const amount = ethers.parseUnits("100000", 6);

  const tx = await mockUSDC.mint(recipient, amount);
  await tx.wait();

  const balance = await mockUSDC.balanceOf(recipient);
  console.log("Done. Balance:", ethers.formatUnits(balance, 6), "mUSDC");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
