import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  
  const mockUSDC = await ethers.getContractAt(
    "MockUSDC",
    "0x1DbA4d24ED6f691D2658D87EEe3D1e4Aff2867f6"
  );
  
  const vaultMockYield = await ethers.getContractAt(
    "VaultMockYield", 
    "0x49362cf0a1Bc54801Ded60Fda5be2BCAefC03eb6"
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
