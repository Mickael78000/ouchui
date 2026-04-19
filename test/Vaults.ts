import { expect } from "chai";
import hre from "hardhat";
import "@nomicfoundation/hardhat-ethers-chai-matchers";
import type { MockUSDC, VaultMockYield, VaultT, VaultD } from "../types/ethers-contracts/index.js";

const { ethers, networkHelpers } = await hre.network.connect();

const toUSDC = (amount: string) => ethers.parseUnits(amount, 6);

const ONE_YEAR = 365 * 24 * 60 * 60;
const ONE_DAY = 24 * 60 * 60;

describe("OUCHUI Vault System", function () {
  let mockUSDC: MockUSDC;
  let vaultMockYield: VaultMockYield;
  let vaultT: VaultT;
  let vaultD: VaultD;

  let owner: any;
  let user1: any;
  let user2: any;

  let mockUSDCAddress: string;
  let vaultMockYieldAddress: string;
  let vaultTAddress: string;
  let vaultDAddress: string;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // 1. Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy(owner.address);
    await mockUSDC.waitForDeployment();
    mockUSDCAddress = await mockUSDC.getAddress();

    // 2. Deploy VaultMockYield
    const VaultMockYield = await ethers.getContractFactory("VaultMockYield");
    vaultMockYield = await VaultMockYield.deploy(mockUSDCAddress, owner.address);
    await vaultMockYield.waitForDeployment();
    vaultMockYieldAddress = await vaultMockYield.getAddress();

    // 3. Register VaultMockYield as a minter on MockUSDC
    await mockUSDC.setMinter(vaultMockYieldAddress, true);

    // 4. Deploy VaultT (strategy = VaultMockYield)
    const VaultT = await ethers.getContractFactory("VaultT");
    vaultT = await VaultT.deploy(mockUSDCAddress, vaultMockYieldAddress, owner.address);
    await vaultT.waitForDeployment();
    vaultTAddress = await vaultT.getAddress();

    // 5. Deploy VaultD (simple, no strategy)
    const VaultD = await ethers.getContractFactory("VaultD");
    vaultD = await VaultD.deploy(mockUSDCAddress, owner.address);
    await vaultD.waitForDeployment();
    vaultDAddress = await vaultD.getAddress();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. MockUSDC: decimals and mint behavior
  // ─────────────────────────────────────────────────────────────
  describe("MockUSDC", function () {
    it("Should have 6 decimals, correct name and symbol", async function () {
      expect(await mockUSDC.decimals()).to.equal(6);
      expect(await mockUSDC.name()).to.equal("Mock USD Coin");
      expect(await mockUSDC.symbol()).to.equal("mUSDC");
    });

    it("Should allow owner to mint", async function () {
      await mockUSDC.mint(user1.address, toUSDC("1000"));
      expect(await mockUSDC.balanceOf(user1.address)).to.equal(toUSDC("1000"));
    });

    it("Should allow authorized minter to mint", async function () {
      await mockUSDC.setMinter(user1.address, true);
      await mockUSDC.connect(user1).mint(user2.address, toUSDC("500"));
      expect(await mockUSDC.balanceOf(user2.address)).to.equal(toUSDC("500"));
    });

    it("Should revert when non-owner/non-minter calls mint", async function () {
      await expect(
        mockUSDC.connect(user1).mint(user2.address, toUSDC("1"))
      ).to.be.revertedWithCustomError(mockUSDC, "NotMinterOrOwner");
    });

    it("Should allow owner to revoke minter", async function () {
      await mockUSDC.setMinter(user1.address, true);
      await mockUSDC.setMinter(user1.address, false);
      await expect(
        mockUSDC.connect(user1).mint(user2.address, 1)
      ).to.be.revertedWithCustomError(mockUSDC, "NotMinterOrOwner");
    });

    it("Should revert setMinter from non-owner", async function () {
      await expect(
        mockUSDC.connect(user1).setMinter(user2.address, true)
      ).to.be.revertedWithCustomError(mockUSDC, "OwnableUnauthorizedAccount");
    });

  });

  // ─────────────────────────────────────────────────────────────
  // 2. VaultD: simple ERC-4626, no strategy
  // ─────────────────────────────────────────────────────────────
  describe("VaultD (simple vault)", function () {
    beforeEach(async function () {
      await mockUSDC.mint(user1.address, toUSDC("10000"));
      await mockUSDC.mint(user2.address, toUSDC("10000"));
    });

    it("Should deploy with correct metadata", async function () {
      expect(await vaultD.name()).to.equal("OUCHUI-D Vault Share");
      expect(await vaultD.symbol()).to.equal("ODV");
      expect(await vaultD.decimals()).to.equal(6);
      expect(await vaultD.asset()).to.equal(mockUSDCAddress);
    });

    it("Should have zero totalAssets initially", async function () {
      expect(await vaultD.totalAssets()).to.equal(0);
    });

    it("Should deposit and receive 1:1 shares", async function () {
      await mockUSDC.connect(user1).approve(vaultDAddress, toUSDC("1000"));
      await vaultD.connect(user1).deposit(toUSDC("1000"), user1.address);
      expect(await vaultD.balanceOf(user1.address)).to.equal(toUSDC("1000"));
      expect(await vaultD.totalAssets()).to.equal(toUSDC("1000"));
    });

    it("Should mint exact shares", async function () {
      const needed = await vaultD.previewMint(toUSDC("500"));
      await mockUSDC.connect(user1).approve(vaultDAddress, needed);
      await vaultD.connect(user1).mint(toUSDC("500"), user1.address);
      expect(await vaultD.balanceOf(user1.address)).to.equal(toUSDC("500"));
    });

    it("Should withdraw correctly", async function () {
      await mockUSDC.connect(user1).approve(vaultDAddress, toUSDC("3000"));
      await vaultD.connect(user1).deposit(toUSDC("3000"), user1.address);
      await vaultD.connect(user1).withdraw(toUSDC("1000"), user1.address, user1.address);
      expect(await vaultD.balanceOf(user1.address)).to.equal(toUSDC("2000"));
      expect(await mockUSDC.balanceOf(user1.address)).to.equal(toUSDC("8000"));
    });

    it("Should redeem correctly", async function () {
      await mockUSDC.connect(user1).approve(vaultDAddress, toUSDC("2000"));
      await vaultD.connect(user1).deposit(toUSDC("2000"), user1.address);
      await vaultD.connect(user1).redeem(toUSDC("1000"), user1.address, user1.address);
      expect(await vaultD.balanceOf(user1.address)).to.equal(toUSDC("1000"));
      expect(await mockUSDC.balanceOf(user1.address)).to.equal(toUSDC("9000"));
    });

    it("Should NOT auto-deploy (all MockUSDC held directly)", async function () {
      await mockUSDC.connect(user1).approve(vaultDAddress, toUSDC("5000"));
      await vaultD.connect(user1).deposit(toUSDC("5000"), user1.address);
      expect(await mockUSDC.balanceOf(vaultDAddress)).to.equal(toUSDC("5000"));
      expect(await vaultD.totalAssets()).to.equal(toUSDC("5000"));
    });

    it("Should handle multi-user deposits and full withdrawals", async function () {
      await mockUSDC.connect(user1).approve(vaultDAddress, toUSDC("3000"));
      await mockUSDC.connect(user2).approve(vaultDAddress, toUSDC("2000"));
      await vaultD.connect(user1).deposit(toUSDC("3000"), user1.address);
      await vaultD.connect(user2).deposit(toUSDC("2000"), user2.address);
      expect(await vaultD.totalAssets()).to.equal(toUSDC("5000"));

      await vaultD.connect(user1).withdraw(toUSDC("3000"), user1.address, user1.address);
      await vaultD.connect(user2).withdraw(toUSDC("2000"), user2.address, user2.address);
      expect(await vaultD.totalAssets()).to.equal(0);
      expect(await vaultD.totalSupply()).to.equal(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. VaultMockYield: accrual, rate updates, previews
  // ─────────────────────────────────────────────────────────────
  describe("VaultMockYield", function () {
    beforeEach(async function () {
      await mockUSDC.mint(user1.address, toUSDC("100000"));
      await mockUSDC.mint(owner.address, toUSDC("100000"));
    });

    it("Should deploy with correct metadata", async function () {
      expect(await vaultMockYield.name()).to.equal("OUCHUI Mock Yield Vault");
      expect(await vaultMockYield.symbol()).to.equal("OMY");
      expect(await vaultMockYield.decimals()).to.equal(6);
      expect(await vaultMockYield.asset()).to.equal(mockUSDCAddress);
    });

    it("Should have zero totalAssets initially", async function () {
      expect(await vaultMockYield.totalAssets()).to.equal(0);
    });

    describe("Rate updates", function () {
      it("Should allow owner to set rate", async function () {
        await expect(vaultMockYield.setMockRate(500))
          .to.emit(vaultMockYield, "MockRateUpdated")
          .withArgs(0, 500);
        expect(await vaultMockYield.mockRateBps()).to.equal(500);
      });

      it("Should revert if rate > MAX_RATE_BPS", async function () {
        await expect(
          vaultMockYield.setMockRate(10001)
        ).to.be.revertedWithCustomError(vaultMockYield, "MockRateTooHigh");
      });

      it("Should revert when non-owner sets rate", async function () {
        await expect(
          vaultMockYield.connect(user1).setMockRate(100)
        ).to.be.revertedWithCustomError(vaultMockYield, "OwnableUnauthorizedAccount");
      });
    });

    describe("Accrual over time", function () {
      it("Should accrue ~5% yield over one year on 10000 USDC", async function () {
        await mockUSDC.connect(user1).approve(vaultMockYieldAddress, toUSDC("10000"));
        await vaultMockYield.connect(user1).deposit(toUSDC("10000"), user1.address);

        await vaultMockYield.setMockRate(500); // 5%

        await networkHelpers.time.increase(ONE_YEAR);

        const totalBefore = await vaultMockYield.totalAssets();
        await expect(vaultMockYield.accrueYield())
          .to.emit(vaultMockYield, "YieldAccrued");

        const totalAfter = await vaultMockYield.totalAssets();
        const yieldAccrued = totalAfter - totalBefore;

        // ~500 USDC ± rounding
        expect(yieldAccrued).to.be.closeTo(toUSDC("500"), toUSDC("0.01"));
        // totalAssets must equal real balance (fully backed)
        expect(totalAfter).to.equal(await mockUSDC.balanceOf(vaultMockYieldAddress));
      });

      it("Should accrue zero yield at 0% rate", async function () {
        await mockUSDC.connect(user1).approve(vaultMockYieldAddress, toUSDC("10000"));
        await vaultMockYield.connect(user1).deposit(toUSDC("10000"), user1.address);
        // rate is 0 by default

        await networkHelpers.time.increase(ONE_YEAR);
        await vaultMockYield.accrueYield();

        expect(await vaultMockYield.totalAssets()).to.equal(toUSDC("10000"));
      });

      it("Should accrue proportionally over partial year (30 days)", async function () {
        await mockUSDC.connect(user1).approve(vaultMockYieldAddress, toUSDC("10000"));
        await vaultMockYield.connect(user1).deposit(toUSDC("10000"), user1.address);
        await vaultMockYield.setMockRate(1000); // 10%

        await networkHelpers.time.increase(30 * ONE_DAY);
        await vaultMockYield.accrueYield();

        // Expected: 10000 * 10% * 30/365 ≈ 82.19 USDC
        const total = await vaultMockYield.totalAssets();
        expect(total - toUSDC("10000")).to.be.closeTo(toUSDC("82.19"), toUSDC("0.1"));
      });

      it("Should accrue nothing on zero principal", async function () {
        await vaultMockYield.setMockRate(1000);
        await networkHelpers.time.increase(ONE_YEAR);
        await vaultMockYield.accrueYield();
        expect(await vaultMockYield.totalAssets()).to.equal(0);
      });

      it("Should accrue negligible yield when elapsed is minimal", async function () {
        await mockUSDC.connect(user1).approve(vaultMockYieldAddress, toUSDC("10000"));
        await vaultMockYield.connect(user1).deposit(toUSDC("10000"), user1.address);
        await vaultMockYield.setMockRate(500);
        // accrueYield in the next block — only ~1s elapsed
        await vaultMockYield.accrueYield();
        // At most a few hundred wei of yield from ~1-2 seconds
        expect(await vaultMockYield.totalAssets()).to.be.closeTo(toUSDC("10000"), 200n);
      });

      it("Should revert accrueYield from non-owner", async function () {
        await expect(
          vaultMockYield.connect(user1).accrueYield()
        ).to.be.revertedWithCustomError(vaultMockYield, "OwnableUnauthorizedAccount");
      });

      it("totalAssets always equals real MockUSDC balance (fully backed)", async function () {
        await mockUSDC.connect(user1).approve(vaultMockYieldAddress, toUSDC("10000"));
        await vaultMockYield.connect(user1).deposit(toUSDC("10000"), user1.address);
        await vaultMockYield.setMockRate(500);

        await networkHelpers.time.increase(ONE_YEAR);
        await vaultMockYield.accrueYield();

        expect(await vaultMockYield.totalAssets()).to.equal(
          await mockUSDC.balanceOf(vaultMockYieldAddress)
        );
      });
    });

    describe("Preview consistency", function () {
      it("previewDeposit should match actual shares received", async function () {
        await mockUSDC.connect(user1).approve(vaultMockYieldAddress, toUSDC("5000"));
        const preview = await vaultMockYield.previewDeposit(toUSDC("5000"));
        await vaultMockYield.connect(user1).deposit(toUSDC("5000"), user1.address);
        expect(await vaultMockYield.balanceOf(user1.address)).to.equal(preview);
      });

      it("previewMint should match actual assets pulled", async function () {
        const shares = toUSDC("3000");
        const preview = await vaultMockYield.previewMint(shares);
        await mockUSDC.connect(user1).approve(vaultMockYieldAddress, preview);
        const before = await mockUSDC.balanceOf(user1.address);
        await vaultMockYield.connect(user1).mint(shares, user1.address);
        const after_ = await mockUSDC.balanceOf(user1.address);
        expect(before - after_).to.equal(preview);
      });

      it("previewWithdraw matches actual shares burned after yield", async function () {
        await mockUSDC.connect(user1).approve(vaultMockYieldAddress, toUSDC("10000"));
        await vaultMockYield.connect(user1).deposit(toUSDC("10000"), user1.address);
        await vaultMockYield.setMockRate(500);
        await networkHelpers.time.increase(ONE_YEAR);
        await vaultMockYield.accrueYield();

        const preview = await vaultMockYield.previewWithdraw(toUSDC("5000"));
        const sharesBefore = await vaultMockYield.balanceOf(user1.address);
        await vaultMockYield.connect(user1).withdraw(toUSDC("5000"), user1.address, user1.address);
        const sharesAfter = await vaultMockYield.balanceOf(user1.address);
        expect(sharesBefore - sharesAfter).to.equal(preview);
      });

      it("previewRedeem matches actual assets received after yield", async function () {
        await mockUSDC.connect(user1).approve(vaultMockYieldAddress, toUSDC("10000"));
        await vaultMockYield.connect(user1).deposit(toUSDC("10000"), user1.address);
        await vaultMockYield.setMockRate(500);
        await networkHelpers.time.increase(ONE_YEAR);
        await vaultMockYield.accrueYield();

        const sharesToRedeem = toUSDC("5000");
        const preview = await vaultMockYield.previewRedeem(sharesToRedeem);
        const usdcBefore = await mockUSDC.balanceOf(user1.address);
        await vaultMockYield.connect(user1).redeem(sharesToRedeem, user1.address, user1.address);
        const usdcAfter = await mockUSDC.balanceOf(user1.address);
        expect(usdcAfter - usdcBefore).to.equal(preview);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. VaultT: strategy-aware vault
  // ─────────────────────────────────────────────────────────────
  describe("VaultT (strategy vault)", function () {
    beforeEach(async function () {
      await mockUSDC.mint(user1.address, toUSDC("100000"));
      await mockUSDC.mint(user2.address, toUSDC("100000"));
      await mockUSDC.mint(owner.address, toUSDC("100000"));
    });

    it("Should deploy with correct metadata and strategy reference", async function () {
      expect(await vaultT.name()).to.equal("OUCHUI-T Vault Share");
      expect(await vaultT.symbol()).to.equal("OTV");
      expect(await vaultT.decimals()).to.equal(6);
      expect(await vaultT.asset()).to.equal(mockUSDCAddress);
      expect(await vaultT.strategy()).to.equal(vaultMockYieldAddress);
    });

    it("Should have zero totalAssets initially", async function () {
      expect(await vaultT.totalAssets()).to.equal(0);
    });

    describe("Deposit auto-routing into VaultMockYield", function () {
      it("Should auto-deploy deposited MockUSDC into strategy", async function () {
        await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("5000"));
        await vaultT.connect(user1).deposit(toUSDC("5000"), user1.address);

        // VaultT should hold 0 idle MockUSDC (all deployed)
        expect(await mockUSDC.balanceOf(vaultTAddress)).to.equal(0);
        // VaultT should hold VaultMockYield shares
        expect(await vaultMockYield.balanceOf(vaultTAddress)).to.be.greaterThan(0);
        // totalAssets reflects the deployed position
        expect(await vaultT.totalAssets()).to.be.closeTo(toUSDC("5000"), 1n);
      });

      it("Should give user correct VaultT shares on deposit (1:1)", async function () {
        await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("3000"));
        await vaultT.connect(user1).deposit(toUSDC("3000"), user1.address);
        expect(await vaultT.balanceOf(user1.address)).to.equal(toUSDC("3000"));
      });

      it("Should auto-deploy on mint as well", async function () {
        const needed = await vaultT.previewMint(toUSDC("2000"));
        await mockUSDC.connect(user1).approve(vaultTAddress, needed);
        await vaultT.connect(user1).mint(toUSDC("2000"), user1.address);

        expect(await mockUSDC.balanceOf(vaultTAddress)).to.equal(0);
        expect(await vaultMockYield.balanceOf(vaultTAddress)).to.be.closeTo(toUSDC("2000"), 1n);
      });

      it("Should handle multiple deposits", async function () {
        await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("3000"));
        await vaultT.connect(user1).deposit(toUSDC("1000"), user1.address);
        await vaultT.connect(user1).deposit(toUSDC("2000"), user1.address);

        expect(await vaultT.balanceOf(user1.address)).to.equal(toUSDC("3000"));
        expect(await vaultT.totalAssets()).to.be.closeTo(toUSDC("3000"), 1n);
        expect(await mockUSDC.balanceOf(vaultTAddress)).to.equal(0);
      });
    });

    describe("Withdraw/redeem pulling assets back", function () {
      beforeEach(async function () {
        await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("10000"));
        await vaultT.connect(user1).deposit(toUSDC("10000"), user1.address);
      });

      it("Should pull from VaultMockYield on withdraw", async function () {
        const stratBefore = await vaultMockYield.balanceOf(vaultTAddress);
        await vaultT.connect(user1).withdraw(toUSDC("4000"), user1.address, user1.address);

        expect(await mockUSDC.balanceOf(user1.address)).to.be.closeTo(toUSDC("94000"), 1n);
        expect(await vaultMockYield.balanceOf(vaultTAddress)).to.be.lessThan(stratBefore);
        // VaultT idle should be 0 after withdrawal completes
        expect(await mockUSDC.balanceOf(vaultTAddress)).to.equal(0);
      });

      it("Should pull from VaultMockYield on redeem", async function () {
        await vaultT.connect(user1).redeem(toUSDC("5000"), user1.address, user1.address);
        expect(await vaultT.balanceOf(user1.address)).to.equal(toUSDC("5000"));
        expect(await mockUSDC.balanceOf(user1.address)).to.be.closeTo(toUSDC("95000"), 1n);
      });

      it("Should allow full withdrawal (all shares)", async function () {
        const allShares = await vaultT.balanceOf(user1.address);
        await vaultT.connect(user1).redeem(allShares, user1.address, user1.address);

        expect(await vaultT.balanceOf(user1.address)).to.equal(0);
        expect(await vaultT.totalSupply()).to.equal(0);
        expect(await vaultT.totalAssets()).to.be.closeTo(0n, 1n);
        expect(await mockUSDC.balanceOf(user1.address)).to.be.closeTo(toUSDC("100000"), 1n);
      });

      it("Should revert when withdrawing more than owned", async function () {
        await expect(
          vaultT.connect(user1).withdraw(toUSDC("11000"), user1.address, user1.address)
        ).to.be.revertedWithCustomError(vaultT, "ERC4626ExceededMaxWithdraw");
      });
    });

    describe("totalAssets() correctness", function () {
      it("Should reflect deployed position (no idle)", async function () {
        await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("8000"));
        await vaultT.connect(user1).deposit(toUSDC("8000"), user1.address);

        expect(await mockUSDC.balanceOf(vaultTAddress)).to.equal(0);
        expect(await vaultT.totalAssets()).to.be.closeTo(toUSDC("8000"), 1n);
      });

      it("Should increase when VaultMockYield accrues yield", async function () {
        await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("10000"));
        await vaultT.connect(user1).deposit(toUSDC("10000"), user1.address);
        await vaultMockYield.setMockRate(500); // 5%

        const totalBefore = await vaultT.totalAssets();

        await networkHelpers.time.increase(ONE_YEAR);
        await vaultMockYield.accrueYield();

        const totalAfter = await vaultT.totalAssets();
        expect(totalAfter).to.be.greaterThan(totalBefore);
        // ~10500 USDC
        expect(totalAfter).to.be.closeTo(toUSDC("10500"), toUSDC("1"));
      });

      it("Should NOT include assets not owned by VaultT", async function () {
        // User1 deposits into VaultT
        await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("5000"));
        await vaultT.connect(user1).deposit(toUSDC("5000"), user1.address);

        // User2 deposits directly into VaultMockYield (not via VaultT)
        await mockUSDC.connect(user2).approve(vaultMockYieldAddress, toUSDC("20000"));
        await vaultMockYield.connect(user2).deposit(toUSDC("20000"), user2.address);

        // VaultT totalAssets should still be ~5000
        expect(await vaultT.totalAssets()).to.be.closeTo(toUSDC("5000"), 1n);
      });
    });

    describe("Preview consistency (two-layer model)", function () {
      it("previewDeposit should match actual shares", async function () {
        const preview = await vaultT.previewDeposit(toUSDC("2000"));
        await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("2000"));
        await vaultT.connect(user1).deposit(toUSDC("2000"), user1.address);
        expect(await vaultT.balanceOf(user1.address)).to.equal(preview);
      });

      it("previewMint should match actual assets pulled", async function () {
        const shares = toUSDC("3000");
        const preview = await vaultT.previewMint(shares);
        await mockUSDC.connect(user1).approve(vaultTAddress, preview);
        const before = await mockUSDC.balanceOf(user1.address);
        await vaultT.connect(user1).mint(shares, user1.address);
        const after_ = await mockUSDC.balanceOf(user1.address);
        expect(before - after_).to.equal(preview);
      });

      it("previewWithdraw should match actual shares burned", async function () {
        await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("10000"));
        await vaultT.connect(user1).deposit(toUSDC("10000"), user1.address);

        const preview = await vaultT.previewWithdraw(toUSDC("4000"));
        const sharesBefore = await vaultT.balanceOf(user1.address);
        await vaultT.connect(user1).withdraw(toUSDC("4000"), user1.address, user1.address);
        const sharesAfter = await vaultT.balanceOf(user1.address);
        expect(sharesBefore - sharesAfter).to.equal(preview);
      });

      it("previewRedeem should match actual assets received", async function () {
        await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("10000"));
        await vaultT.connect(user1).deposit(toUSDC("10000"), user1.address);

        const sharesToRedeem = toUSDC("3000");
        const preview = await vaultT.previewRedeem(sharesToRedeem);
        const usdcBefore = await mockUSDC.balanceOf(user1.address);
        await vaultT.connect(user1).redeem(sharesToRedeem, user1.address, user1.address);
        const usdcAfter = await mockUSDC.balanceOf(user1.address);
        expect(usdcAfter - usdcBefore).to.equal(preview);
      });

      it("previewRedeem(allShares) should equal maxWithdraw after yield", async function () {
        await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("10000"));
        await vaultT.connect(user1).deposit(toUSDC("10000"), user1.address);
        await vaultMockYield.setMockRate(500);

        await networkHelpers.time.increase(ONE_YEAR);
        await vaultMockYield.accrueYield();

        const allShares = await vaultT.balanceOf(user1.address);
        const previewR = await vaultT.previewRedeem(allShares);
        const maxW = await vaultT.maxWithdraw(user1.address);
        expect(previewR).to.equal(maxW);
      });
    });

    describe("Multi-user scenarios", function () {
      it("Should handle two users depositing and fully withdrawing", async function () {
        await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("6000"));
        await mockUSDC.connect(user2).approve(vaultTAddress, toUSDC("4000"));
        await vaultT.connect(user1).deposit(toUSDC("6000"), user1.address);
        await vaultT.connect(user2).deposit(toUSDC("4000"), user2.address);

        expect(await vaultT.totalAssets()).to.be.closeTo(toUSDC("10000"), 1n);

        await vaultT.connect(user1).withdraw(toUSDC("6000"), user1.address, user1.address);
        await vaultT.connect(user2).withdraw(toUSDC("4000"), user2.address, user2.address);

        expect(await vaultT.totalSupply()).to.equal(0);
        expect(await vaultT.totalAssets()).to.be.closeTo(0n, 1n);
      });

      it("Should handle deposit-for-other and withdraw-on-behalf", async function () {
        // User1 deposits for user2
        await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("2000"));
        await vaultT.connect(user1).deposit(toUSDC("2000"), user2.address);

        expect(await vaultT.balanceOf(user2.address)).to.equal(toUSDC("2000"));
        expect(await vaultT.balanceOf(user1.address)).to.equal(0);

        // User2 approves user1 to manage shares
        await vaultT.connect(user2).approve(user1.address, toUSDC("2000"));
        // User1 withdraws on behalf of user2
        await vaultT.connect(user1).withdraw(toUSDC("1500"), user1.address, user2.address);
        expect(await vaultT.balanceOf(user2.address)).to.equal(toUSDC("500"));
      });

      it("Multi-user with yield: each user gets fair share", async function () {
        await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("6000"));
        await mockUSDC.connect(user2).approve(vaultTAddress, toUSDC("4000"));
        await vaultT.connect(user1).deposit(toUSDC("6000"), user1.address);
        await vaultT.connect(user2).deposit(toUSDC("4000"), user2.address);

        await vaultMockYield.setMockRate(1000); // 10%
        await networkHelpers.time.increase(ONE_YEAR);
        await vaultMockYield.accrueYield();

        // totalAssets should be ~11000
        expect(await vaultT.totalAssets()).to.be.closeTo(toUSDC("11000"), toUSDC("1"));

        // User1 has 60% of shares, user2 has 40%
        const u1Max = await vaultT.maxWithdraw(user1.address);
        const u2Max = await vaultT.maxWithdraw(user2.address);
        expect(u1Max).to.be.closeTo(toUSDC("6600"), toUSDC("1"));
        expect(u2Max).to.be.closeTo(toUSDC("4400"), toUSDC("1"));
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Zero-value edge cases
  // ─────────────────────────────────────────────────────────────
  describe("Zero-value edge cases", function () {
    it("VaultT: deposit 0 should succeed with 0 shares", async function () {
      await vaultT.connect(user1).deposit(0, user1.address);
      expect(await vaultT.balanceOf(user1.address)).to.equal(0);
    });

    it("VaultT: mint 0 shares should succeed", async function () {
      await vaultT.connect(user1).mint(0, user1.address);
      expect(await vaultT.balanceOf(user1.address)).to.equal(0);
    });

    it("VaultD: deposit 0 should succeed", async function () {
      await vaultD.connect(user1).deposit(0, user1.address);
      expect(await vaultD.balanceOf(user1.address)).to.equal(0);
    });

    it("VaultMockYield: deposit 0 should succeed", async function () {
      await vaultMockYield.connect(user1).deposit(0, user1.address);
      expect(await vaultMockYield.balanceOf(user1.address)).to.equal(0);
    });

    it("VaultT: withdraw 0 should succeed when user has shares", async function () {
      await mockUSDC.mint(user1.address, toUSDC("1000"));
      await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("1000"));
      await vaultT.connect(user1).deposit(toUSDC("1000"), user1.address);
      await vaultT.connect(user1).withdraw(0, user1.address, user1.address);
      expect(await vaultT.balanceOf(user1.address)).to.equal(toUSDC("1000"));
    });

    it("VaultT: redeem 0 should succeed when user has shares", async function () {
      await mockUSDC.mint(user1.address, toUSDC("1000"));
      await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("1000"));
      await vaultT.connect(user1).deposit(toUSDC("1000"), user1.address);
      await vaultT.connect(user1).redeem(0, user1.address, user1.address);
      expect(await vaultT.balanceOf(user1.address)).to.equal(toUSDC("1000"));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Empty-vault initialization behavior
  // ─────────────────────────────────────────────────────────────
  describe("Empty vault initialization", function () {
    it("VaultT: conversion on empty vault returns correct values", async function () {
      expect(await vaultT.convertToShares(toUSDC("1000"))).to.equal(toUSDC("1000"));
      expect(await vaultT.convertToAssets(toUSDC("1000"))).to.equal(toUSDC("1000"));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Donation / inflation manipulation scenarios
  // ─────────────────────────────────────────────────────────────
  describe("Donation / inflation attack scenarios", function () {
    beforeEach(async function () {
      await mockUSDC.mint(user1.address, toUSDC("100000"));
      await mockUSDC.mint(user2.address, toUSDC("100000"));
    });

    it("VaultD: donation attack is limited by OZ virtual shares", async function () {
      // Attacker deposits 1 wei
      await mockUSDC.connect(user1).approve(vaultDAddress, 1n);
      await vaultD.connect(user1).deposit(1n, user1.address);

      // Attacker donates 10000 USDC directly to vault
      await mockUSDC.connect(user1).transfer(vaultDAddress, toUSDC("10000"));

      // Victim deposits 10000 USDC
      await mockUSDC.connect(user2).approve(vaultDAddress, toUSDC("10000"));
      await vaultD.connect(user2).deposit(toUSDC("10000"), user2.address);

      // With 6-decimal tokens and _decimalsOffset=0, OZ virtual share gives
      // +1 virtual share and +1 virtual asset. The donation dilutes the
      // victim but does NOT let the attacker steal everything.
      // Victim gets shares > 0 and can withdraw a meaningful amount.
      const victimShares = await vaultD.balanceOf(user2.address);
      expect(victimShares).to.be.greaterThan(0);
      const victimMaxW = await vaultD.maxWithdraw(user2.address);
      // Victim recovers at least half (OZ virtual shares prevent total loss)
      expect(victimMaxW).to.be.greaterThan(toUSDC("5000"));
      // Attacker cannot profit more than the donation cost
      const attackerMaxW = await vaultD.maxWithdraw(user1.address);
      // Attacker's withdrawable = their share of inflated pool
      // They can recover some of their donation but the attack is not free
      expect(attackerMaxW).to.be.lessThan(toUSDC("20000"));
    });

    it("VaultT: donation to VaultT should not inflate shares for next depositor", async function () {
      // User1 deposits normally
      await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("1000"));
      await vaultT.connect(user1).deposit(toUSDC("1000"), user1.address);

      // Someone donates MockUSDC directly to VaultT (idle balance goes up)
      await mockUSDC.connect(user1).transfer(vaultTAddress, toUSDC("5000"));

      // User2 deposits
      await mockUSDC.connect(user2).approve(vaultTAddress, toUSDC("1000"));
      await vaultT.connect(user2).deposit(toUSDC("1000"), user2.address);

      // User2 should get reasonable shares; OZ virtual share protects
      const u2Shares = await vaultT.balanceOf(user2.address);
      expect(u2Shares).to.be.greaterThan(0);
      const u2MaxW = await vaultT.maxWithdraw(user2.address);
      expect(u2MaxW).to.be.closeTo(toUSDC("1000"), toUSDC("1"));
    });

    it("VaultMockYield: donation attack is limited by OZ virtual shares", async function () {
      // Attacker deposits 1 wei
      await mockUSDC.connect(user1).approve(vaultMockYieldAddress, 1n);
      await vaultMockYield.connect(user1).deposit(1n, user1.address);

      // Donate 10000 USDC
      await mockUSDC.connect(user1).transfer(vaultMockYieldAddress, toUSDC("10000"));

      // Victim deposits
      await mockUSDC.connect(user2).approve(vaultMockYieldAddress, toUSDC("10000"));
      await vaultMockYield.connect(user2).deposit(toUSDC("10000"), user2.address);

      // Same as VaultD: victim retains meaningful value, not zero
      const victimShares = await vaultMockYield.balanceOf(user2.address);
      expect(victimShares).to.be.greaterThan(0);
      const victimMaxW = await vaultMockYield.maxWithdraw(user2.address);
      expect(victimMaxW).to.be.greaterThan(toUSDC("5000"));
    });

    it("VaultT: second-order donation to VaultMockYield inflates VaultT totalAssets", async function () {
      await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("5000"));
      await vaultT.connect(user1).deposit(toUSDC("5000"), user1.address);

      const totalBefore = await vaultT.totalAssets();

      // Donate directly to VaultMockYield
      await mockUSDC.connect(user2).transfer(vaultMockYieldAddress, toUSDC("1000"));

      // VaultT totalAssets increases (VaultMockYield share value went up)
      const totalAfter = await vaultT.totalAssets();
      expect(totalAfter).to.be.greaterThan(totalBefore);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Decimal correctness with 6-decimal MockUSDC
  // ─────────────────────────────────────────────────────────────
  describe("Decimal correctness (6 decimals)", function () {
    beforeEach(async function () {
      await mockUSDC.mint(user1.address, toUSDC("100000"));
    });

    it("All vaults report 6 decimals", async function () {
      expect(await mockUSDC.decimals()).to.equal(6);
      expect(await vaultT.decimals()).to.equal(6);
      expect(await vaultD.decimals()).to.equal(6);
      expect(await vaultMockYield.decimals()).to.equal(6);
    });

    it("VaultT: small amounts (1 USDC = 1e6) round correctly", async function () {
      await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("1"));
      await vaultT.connect(user1).deposit(toUSDC("1"), user1.address);
      expect(await vaultT.balanceOf(user1.address)).to.equal(toUSDC("1"));
    });

    it("VaultT: sub-dollar amounts (0.01 USDC = 10000 units)", async function () {
      const amount = toUSDC("0.01");
      await mockUSDC.connect(user1).approve(vaultTAddress, amount);
      await vaultT.connect(user1).deposit(amount, user1.address);
      expect(await vaultT.balanceOf(user1.address)).to.equal(amount);
    });

    it("VaultT: 1 wei deposit", async function () {
      await mockUSDC.connect(user1).approve(vaultTAddress, 1n);
      await vaultT.connect(user1).deposit(1n, user1.address);
      expect(await vaultT.balanceOf(user1.address)).to.equal(1n);
    });

    it("VaultD: large amounts (999999 USDC)", async function () {
      await mockUSDC.mint(user1.address, toUSDC("999999"));
      await mockUSDC.connect(user1).approve(vaultDAddress, toUSDC("999999"));
      await vaultD.connect(user1).deposit(toUSDC("999999"), user1.address);
      expect(await vaultD.balanceOf(user1.address)).to.equal(toUSDC("999999"));
      expect(await vaultD.totalAssets()).to.equal(toUSDC("999999"));
    });

    it("VaultT: odd precision amounts maintain consistency", async function () {
      const amounts = [1n, 7n, 13n, 99n, 777n, toUSDC("0.000001")];
      let totalDeposited = 0n;
      for (const amt of amounts) {
        totalDeposited += amt;
        await mockUSDC.connect(user1).approve(vaultTAddress, amt);
        await vaultT.connect(user1).deposit(amt, user1.address);
      }
      expect(await vaultT.balanceOf(user1.address)).to.equal(totalDeposited);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9. Cross-vault isolation
  // ─────────────────────────────────────────────────────────────
  describe("Cross-vault isolation", function () {
    it("VaultD and VaultT are independent", async function () {
      await mockUSDC.mint(user1.address, toUSDC("20000"));
      await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("8000"));
      await mockUSDC.connect(user1).approve(vaultDAddress, toUSDC("5000"));

      await vaultT.connect(user1).deposit(toUSDC("8000"), user1.address);
      await vaultD.connect(user1).deposit(toUSDC("5000"), user1.address);

      expect(await vaultT.totalAssets()).to.be.closeTo(toUSDC("8000"), 1n);
      expect(await vaultD.totalAssets()).to.equal(toUSDC("5000"));
      // VaultD holds MockUSDC directly
      expect(await mockUSDC.balanceOf(vaultDAddress)).to.equal(toUSDC("5000"));
      // VaultT does NOT hold MockUSDC (deployed to strategy)
      expect(await mockUSDC.balanceOf(vaultTAddress)).to.equal(0);
    });

    it("Users in VaultD cannot affect VaultT", async function () {
      await mockUSDC.mint(user1.address, toUSDC("10000"));
      await mockUSDC.mint(user2.address, toUSDC("10000"));

      await mockUSDC.connect(user1).approve(vaultTAddress, toUSDC("5000"));
      await vaultT.connect(user1).deposit(toUSDC("5000"), user1.address);

      await mockUSDC.connect(user2).approve(vaultDAddress, toUSDC("5000"));
      await vaultD.connect(user2).deposit(toUSDC("5000"), user2.address);

      // user2 cannot withdraw from VaultT
      await expect(
        vaultT.connect(user2).withdraw(1, user2.address, user2.address)
      ).to.be.revertedWithCustomError(vaultT, "ERC4626ExceededMaxWithdraw");

      // user1 cannot withdraw from VaultD
      await expect(
        vaultD.connect(user1).withdraw(1, user1.address, user1.address)
      ).to.be.revertedWithCustomError(vaultD, "ERC4626ExceededMaxWithdraw");
    });
  });
});
