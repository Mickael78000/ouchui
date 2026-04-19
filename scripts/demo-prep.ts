import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  
  const mockUSDC = await ethers.getContractAt(
    "MockUSDC",
    "0x5561791E7Edb27640766A38f701757952Da1ddB5"
  );
  
  const vaultMockYield = await ethers.getContractAt(
    "VaultMockYield", 
    "0x4eA6E1cBc40B13873e314db5148d85107c70F689"
  );
  
  const deployer = "0x3Cebb88aC6eA09d20Ec3Ab53D0caa77860C28184";
  
  // Mint demo tokens if needed
  console.log("Deployer balance:", ethers.formatUnits(
    await mockUSDC.balanceOf(deployer), 6
  ));
  
  // Set 5% rate
  const rateTx = await vaultMockYield.setMockRate(500);
  await rateTx.wait();
  
  // Accrue yield
  const yieldTx = await vaultMockYield.accrueYield();
  await yieldTx.wait();
  
  console.log("Mock rate bps:", await vaultMockYield.mockRateBps());
  console.log("VaultMockYield TVL:", ethers.formatUnits(
    await vaultMockYield.totalAssets(), 6
  ));
}

main().catch(console.error);
