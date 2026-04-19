// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../contracts/MockUSDC.sol";
import "../contracts/VaultD.sol";
import "../contracts/VaultT.sol";
import "../contracts/VaultMockYield.sol";

/**
 * @title VaultsFuzzTest
 * @notice Solidity fuzz tests for the OUCHUI vault system, run by Hardhat 3's
 *         native Solidity test runner (1 000 random inputs per test).
 *
 *         Bounding strategy: inputs are clamped with `bound()` — a helper
 *         defined below — instead of `% N + 1` so the range is explicit and
 *         readable. No external dependency is required.
 *
 *         Vault roles:
 *           VaultD          — pure ERC-4626, 1:1 deposit/shares, no strategy.
 *           VaultT          — strategy vault; routes deposits into VaultMockYield,
 *                             1 wei rounding tolerance on redeem.
 *           VaultMockYield  — simulated-yield vault; totalAssets() == real
 *                             MockUSDC balance at all times (fully backed).
 */
contract VaultsFuzzTest {

    // ── Constants ────────────────────────────────────────────────

    /// @dev Upper bound for deposit amounts: 1 000 000 USDC (6 decimals)
    uint256 constant MAX_DEPOSIT = 1_000_000e6;

    /// @dev Lower bound for deposit amounts: 1 unit (smallest non-zero)
    uint256 constant MIN_DEPOSIT = 1;

    /// @dev Maximum rate accepted by VaultMockYield (100% APY)
    uint256 constant MAX_RATE_BPS = 10_000;

    // ── State ────────────────────────────────────────────────────

    MockUSDC       mockUSDC;
    VaultMockYield vaultMockYield;
    VaultT         vaultT;
    VaultD         vaultD;

    // ── Setup ────────────────────────────────────────────────────

    function setUp() public {
        mockUSDC       = new MockUSDC(address(this));
        vaultMockYield = new VaultMockYield(mockUSDC, address(this));
        mockUSDC.setMinter(address(vaultMockYield), true);
        vaultT = new VaultT(mockUSDC, vaultMockYield, address(this));
        vaultD = new VaultD(mockUSDC, address(this));
    }

    // ── Internal helper ──────────────────────────────────────────

    /// @dev Clamp `x` to [lo, hi] without modulo bias.
    function bound(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) {
        if (x < lo) return lo;
        if (x > hi) return hi;
        return lo + (x % (hi - lo + 1));
    }

    // ═══════════════════════════════════════════════════════════════
    // ERC-4626 spec reminder (implemented below for all three vaults)
    //
    //   previewDeposit(assets)  must NOT overestimate  shares minted
    //   previewRedeem(shares)   must NOT overestimate  assets returned
    //   previewMint(shares)     must NOT underestimate assets required
    //   previewWithdraw(assets) must NOT underestimate shares burned
    //
    // The asymmetry protects callers: deposit/redeem previews are safe
    // lower bounds; mint/withdraw previews are safe upper bounds.
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // VaultD — pure 1:1 vault, no strategy
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Property: VaultD issues exactly `amount` shares for any deposit
     *         amount and returns exactly `amount` assets on full redeem
     *         (1:1 invariant on an empty vault).
     */
    function testFuzz_vaultD_sharesEqualAssetsOnDepositAndFullRedeem(uint256 amount) public {
        amount = bound(amount, MIN_DEPOSIT, MAX_DEPOSIT);

        mockUSDC.mint(address(this), amount);
        mockUSDC.approve(address(vaultD), amount);

        uint256 shares = vaultD.deposit(amount, address(this));
        require(shares == amount,  "VaultD: deposit must issue amount shares (1:1)");
        require(vaultD.totalAssets() == amount, "VaultD: totalAssets must equal deposited amount");

        uint256 received = vaultD.redeem(shares, address(this), address(this));
        require(received == amount, "VaultD: full redeem must return exactly deposited amount");
        require(vaultD.totalSupply() == 0, "VaultD: total supply must be zero after full redeem");
    }

    /**
     * @notice Property: previewDeposit(amount) == shares actually minted.
     *         ERC-4626 spec §4: preview must not overestimate.
     *         On VaultD (empty, no yield) it must be exact.
     */
    function testFuzz_vaultD_previewDepositMatchesMintedShares(uint256 amount) public {
        amount = bound(amount, MIN_DEPOSIT, MAX_DEPOSIT);

        uint256 preview = vaultD.previewDeposit(amount);

        mockUSDC.mint(address(this), amount);
        mockUSDC.approve(address(vaultD), amount);
        uint256 actual = vaultD.deposit(amount, address(this));

        require(actual == preview, "VaultD: previewDeposit must equal actual shares minted");
    }

    // ═══════════════════════════════════════════════════════════════
    // VaultT — strategy vault (routes into VaultMockYield)
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Property: after deposit, VaultT holds zero idle MockUSDC
     *         (all assets are deployed into VaultMockYield) and
     *         totalAssets() reflects the full deployed position within 1 wei.
     */
    function testFuzz_vaultT_depositFullyDeploysIntoStrategy(uint256 amount) public {
        amount = bound(amount, MIN_DEPOSIT, MAX_DEPOSIT);

        mockUSDC.mint(address(this), amount);
        mockUSDC.approve(address(vaultT), amount);
        uint256 shares = vaultT.deposit(amount, address(this));

        require(shares > 0, "VaultT: deposit must produce non-zero shares");
        require(
            mockUSDC.balanceOf(address(vaultT)) == 0,
            "VaultT: no MockUSDC must remain idle after deposit"
        );
        // 1 wei tolerance for two-layer ERC-4626 rounding
        require(
            vaultT.totalAssets() + 1 >= amount,
            "VaultT: totalAssets must reflect full deployed position (+/-1 wei)"
        );
    }

    /**
     * @notice Property: full redeem returns at least (amount - 1) assets and
     *         leaves the caller with zero shares (no dust).
     *         The 1-wei tolerance accounts for two-layer ERC-4626 rounding
     *         (VaultT → VaultMockYield).
     */
    function testFuzz_vaultT_fullRedeemReturnsPrincipalMinusOneWeiTolerance(uint256 amount) public {
        amount = bound(amount, MIN_DEPOSIT, MAX_DEPOSIT);

        mockUSDC.mint(address(this), amount);
        mockUSDC.approve(address(vaultT), amount);
        uint256 shares = vaultT.deposit(amount, address(this));

        uint256 received = vaultT.redeem(shares, address(this), address(this));

        require(received + 1 >= amount, "VaultT: redeem must return at least amount-1 (1-wei rounding)");
        require(vaultT.balanceOf(address(this)) == 0, "VaultT: no shares must remain after full redeem");
    }

    /**
     * @notice Property: previewRedeem(shares) == assets actually received.
     *         ERC-4626 spec: preview must not overestimate for the caller.
     *         Tested immediately after deposit (no elapsed time, no yield).
     */
    function testFuzz_vaultT_previewRedeemMatchesAssetsReceived(uint256 amount) public {
        amount = bound(amount, MIN_DEPOSIT, MAX_DEPOSIT);

        mockUSDC.mint(address(this), amount);
        mockUSDC.approve(address(vaultT), amount);
        uint256 shares = vaultT.deposit(amount, address(this));

        uint256 preview = vaultT.previewRedeem(shares);
        uint256 actual  = vaultT.redeem(shares, address(this), address(this));

        require(actual == preview, "VaultT: previewRedeem must equal assets actually received");
    }

    // ═══════════════════════════════════════════════════════════════
    // VaultMockYield — simulated-yield vault
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Property: on an empty vault (first deposit, no yield accrued),
     *         shares issued == deposited amount (1:1) and full redeem
     *         returns exactly the deposited amount.
     */
    function testFuzz_vaultMockYield_firstDepositIs1to1AndFullRedeemIsExact(uint256 amount) public {
        amount = bound(amount, MIN_DEPOSIT, MAX_DEPOSIT);

        mockUSDC.mint(address(this), amount);
        mockUSDC.approve(address(vaultMockYield), amount);
        uint256 shares = vaultMockYield.deposit(amount, address(this));

        require(shares == amount, "VaultMockYield: first deposit must issue amount shares (1:1)");
        require(vaultMockYield.totalAssets() == amount, "VaultMockYield: totalAssets must equal deposit");

        uint256 received = vaultMockYield.redeem(shares, address(this), address(this));
        require(received == amount, "VaultMockYield: full redeem must return exact deposit");
        require(vaultMockYield.totalSupply() == 0, "VaultMockYield: total supply must be zero after full redeem");
    }

    /**
     * @notice Property: totalAssets() always equals the real MockUSDC balance
     *         held by the vault (fully-backed invariant), regardless of rate.
     *         Tested with ~0 elapsed time so accrueYield() mints nothing,
     *         which also verifies that no phantom yield appears on same-block calls.
     */
    function testFuzz_vaultMockYield_totalAssetsEqualsRealBalanceAfterSameBlockAccrual(
        uint256 amount,
        uint256 rateBps
    ) public {
        amount  = bound(amount,  MIN_DEPOSIT, MAX_DEPOSIT);
        // Rate in [1, MAX_RATE_BPS]: 0 is excluded to ensure the branch is exercised
        rateBps = bound(rateBps, 1, MAX_RATE_BPS);

        mockUSDC.mint(address(this), amount);
        mockUSDC.approve(address(vaultMockYield), amount);
        vaultMockYield.deposit(amount, address(this));

        vaultMockYield.setMockRate(rateBps);

        // Same block: elapsed == 0, so accrueYield() must mint exactly 0
        uint256 totalBefore = vaultMockYield.totalAssets();
        vaultMockYield.accrueYield();
        uint256 totalAfter = vaultMockYield.totalAssets();

        require(totalAfter == totalBefore, "VaultMockYield: same-block accrual must not change totalAssets");
        require(
            vaultMockYield.totalAssets() == mockUSDC.balanceOf(address(vaultMockYield)),
            "VaultMockYield: totalAssets must always equal real MockUSDC balance (fully backed)"
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // previewMint — must NOT underestimate assets required
    // ERC-4626 spec: previewMint(shares) >= actual assets pulled
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Property: previewMint(shares) >= assets actually pulled by mint(shares).
     *         On VaultD (empty, no yield) this is exact equality.
     */
    function testFuzz_vaultD_previewMintDoesNotUnderestimateAssetsRequired(uint256 shares) public {
        shares = bound(shares, MIN_DEPOSIT, MAX_DEPOSIT);

        uint256 preview = vaultD.previewMint(shares);

        mockUSDC.mint(address(this), preview);
        mockUSDC.approve(address(vaultD), preview);

        uint256 balanceBefore = mockUSDC.balanceOf(address(this));
        vaultD.mint(shares, address(this));
        uint256 assetsActuallyPulled = balanceBefore - mockUSDC.balanceOf(address(this));

        require(
            preview >= assetsActuallyPulled,
            "VaultD: previewMint must not underestimate assets required (preview >= actual)"
        );
        require(
            assetsActuallyPulled == preview,
            "VaultD: mint must pull exactly previewMint assets on 1:1 vault"
        );
    }

    /**
     * @notice Property: previewMint(shares) >= assets actually pulled by mint(shares).
     *         VaultT routes through VaultMockYield; rounding may leave preview == actual.
     */
    function testFuzz_vaultT_previewMintDoesNotUnderestimateAssetsRequired(uint256 shares) public {
        shares = bound(shares, MIN_DEPOSIT, MAX_DEPOSIT);

        uint256 preview = vaultT.previewMint(shares);

        mockUSDC.mint(address(this), preview);
        mockUSDC.approve(address(vaultT), preview);

        uint256 balanceBefore = mockUSDC.balanceOf(address(this));
        vaultT.mint(shares, address(this));
        uint256 assetsActuallyPulled = balanceBefore - mockUSDC.balanceOf(address(this));

        require(
            preview >= assetsActuallyPulled,
            "VaultT: previewMint must not underestimate assets required (preview >= actual)"
        );
    }

    /**
     * @notice Property: previewMint(shares) >= assets actually pulled by mint(shares).
     *         On VaultMockYield (empty, no yield accrued) this is exact equality.
     */
    function testFuzz_vaultMockYield_previewMintDoesNotUnderestimateAssetsRequired(uint256 shares) public {
        shares = bound(shares, MIN_DEPOSIT, MAX_DEPOSIT);

        uint256 preview = vaultMockYield.previewMint(shares);

        mockUSDC.mint(address(this), preview);
        mockUSDC.approve(address(vaultMockYield), preview);

        uint256 balanceBefore = mockUSDC.balanceOf(address(this));
        vaultMockYield.mint(shares, address(this));
        uint256 assetsActuallyPulled = balanceBefore - mockUSDC.balanceOf(address(this));

        require(
            preview >= assetsActuallyPulled,
            "VaultMockYield: previewMint must not underestimate assets required (preview >= actual)"
        );
        require(
            assetsActuallyPulled == preview,
            "VaultMockYield: mint must pull exactly previewMint assets on 1:1 vault"
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // previewWithdraw — must NOT underestimate shares burned
    // ERC-4626 spec: previewWithdraw(assets) >= actual shares burned
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Property: previewWithdraw(assets) >= shares actually burned by withdraw(assets).
     *         On VaultD (empty, no yield) this is exact equality.
     *         Requires a prior deposit to have shares available.
     */
    function testFuzz_vaultD_previewWithdrawDoesNotUnderestimateSharesBurned(uint256 amount) public {
        amount = bound(amount, MIN_DEPOSIT, MAX_DEPOSIT);

        // Deposit first so there are shares and assets to withdraw
        mockUSDC.mint(address(this), amount);
        mockUSDC.approve(address(vaultD), amount);
        vaultD.deposit(amount, address(this));

        // Withdraw half to leave room for rounding without hitting maxWithdraw
        uint256 withdrawAmount = amount / 2;
        if (withdrawAmount == 0) return;

        uint256 preview = vaultD.previewWithdraw(withdrawAmount);

        uint256 sharesBefore = vaultD.balanceOf(address(this));
        vaultD.withdraw(withdrawAmount, address(this), address(this));
        uint256 sharesActuallyBurned = sharesBefore - vaultD.balanceOf(address(this));

        require(
            preview >= sharesActuallyBurned,
            "VaultD: previewWithdraw must not underestimate shares burned (preview >= actual)"
        );
        require(
            sharesActuallyBurned == preview,
            "VaultD: withdraw must burn exactly previewWithdraw shares on 1:1 vault"
        );
    }

    /**
     * @notice Property: previewWithdraw(assets) >= shares actually burned by withdraw(assets).
     *         VaultT routes through VaultMockYield; rounding may leave preview == actual.
     */
    function testFuzz_vaultT_previewWithdrawDoesNotUnderestimateSharesBurned(uint256 amount) public {
        amount = bound(amount, MIN_DEPOSIT, MAX_DEPOSIT);

        mockUSDC.mint(address(this), amount);
        mockUSDC.approve(address(vaultT), amount);
        vaultT.deposit(amount, address(this));

        uint256 withdrawAmount = amount / 2;
        if (withdrawAmount == 0) return;

        uint256 preview = vaultT.previewWithdraw(withdrawAmount);

        uint256 sharesBefore = vaultT.balanceOf(address(this));
        vaultT.withdraw(withdrawAmount, address(this), address(this));
        uint256 sharesActuallyBurned = sharesBefore - vaultT.balanceOf(address(this));

        require(
            preview >= sharesActuallyBurned,
            "VaultT: previewWithdraw must not underestimate shares burned (preview >= actual)"
        );
    }

    /**
     * @notice Property: previewWithdraw(assets) >= shares actually burned by withdraw(assets).
     *         On VaultMockYield (empty, no yield accrued) this is exact equality.
     */
    function testFuzz_vaultMockYield_previewWithdrawDoesNotUnderestimateSharesBurned(uint256 amount) public {
        amount = bound(amount, MIN_DEPOSIT, MAX_DEPOSIT);

        mockUSDC.mint(address(this), amount);
        mockUSDC.approve(address(vaultMockYield), amount);
        vaultMockYield.deposit(amount, address(this));

        uint256 withdrawAmount = amount / 2;
        if (withdrawAmount == 0) return;

        uint256 preview = vaultMockYield.previewWithdraw(withdrawAmount);

        uint256 sharesBefore = vaultMockYield.balanceOf(address(this));
        vaultMockYield.withdraw(withdrawAmount, address(this), address(this));
        uint256 sharesActuallyBurned = sharesBefore - vaultMockYield.balanceOf(address(this));

        require(
            preview >= sharesActuallyBurned,
            "VaultMockYield: previewWithdraw must not underestimate shares burned (preview >= actual)"
        );
        require(
            sharesActuallyBurned == preview,
            "VaultMockYield: withdraw must burn exactly previewWithdraw shares on 1:1 vault"
        );
    }
}
