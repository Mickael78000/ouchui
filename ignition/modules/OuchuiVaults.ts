import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("OuchuiVaultsModule", (m) => {
  const deployer = m.getAccount(0);

  // 1. Deploy MockUSDC (underlying asset)
  const mockUSDC = m.contract("MockUSDC", [deployer], {
    id: "MockUSDC",
  });

  // 2. Deploy VaultMockYield (mock-yield strategy vault over MockUSDC)
  const vaultMockYield = m.contract("VaultMockYield", [mockUSDC, deployer], {
    id: "VaultMockYield",
    after: [mockUSDC],
  });

  // 3. Register VaultMockYield as a minter on MockUSDC so it can self-mint yield
  const setMinter = m.call(mockUSDC, "setMinter", [vaultMockYield, true], {
    id: "SetMinterForVaultMockYield",
    after: [vaultMockYield],
  });

  // 4. Deploy VaultT (T-tranche, auto-deploys into VaultMockYield)
  const vaultT = m.contract("VaultT", [mockUSDC, vaultMockYield, deployer], {
    id: "VaultT",
    after: [vaultMockYield],
  });

  // 5. Deploy VaultD (D-tranche, simple, no strategy)
  const vaultD = m.contract("VaultD", [mockUSDC, deployer], {
    id: "VaultD",
    after: [mockUSDC],
  });

  return {
    mockUSDC,
    vaultMockYield,
    vaultT,
    vaultD,
  };
});
