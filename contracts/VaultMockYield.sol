// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @dev Minimal interface for MockUSDC's minter-aware mint function
interface IMockUSDC {
    function mint(address to, uint256 amount) external;
    function decimals() external view returns (uint8);
}

/**
 * @title VaultMockYield
 * @notice SIMULATED-YIELD ERC-4626 vault over MockUSDC — for testing only.
 * @dev This vault does NOT generate real yield. It simulates deterministic,
 *      time-based yield by minting real MockUSDC tokens to itself when the
 *      owner calls `accrueYield()`.
 *
 *      Accounting model:
 *        totalAssets() = MockUSDC.balanceOf(address(this))   (OZ default)
 *
 *      All "yield" is fully backed by real MockUSDC held by this contract.
 *      There is NO virtual/unbacked accounting.
 *
 *      Yield accrual flow:
 *        1. Owner calls setMockRate(bps) to set an annual rate
 *        2. Owner calls accrueYield() periodically
 *        3. accrueYield() computes:  yield = principal × rateBps × elapsed / (365 days × 10_000)
 *        4. accrueYield() mints that amount of MockUSDC to address(this)
 *        5. Share price increases because real tokens arrived
 *
 *      Prerequisite: This contract must be registered as a minter on MockUSDC
 *                    via mockUSDC.setMinter(address(this), true).
 *
 *      Rounding: yield computation rounds DOWN (Math.Rounding.Floor) so
 *      the vault never mints more yield than the formula warrants.
 *
 *      NOT SUITABLE FOR PRODUCTION. This is a test/demo mock.
 */
contract VaultMockYield is ERC4626, Ownable {
    using Math for uint256;

    /// @notice The MockUSDC contract (needed to call mint)
    IMockUSDC public immutable mockUsdc;

    /// @notice Annual mock yield rate in basis points (e.g. 500 = 5.00%)
    uint256 public mockRateBps;

    /// @notice Block timestamp of the last accrual checkpoint
    uint256 public lastAccrualTimestamp;

    /// @dev Emitted when the mock rate is changed
    event MockRateUpdated(uint256 oldRateBps, uint256 newRateBps);

    /// @dev Emitted when yield is accrued (real MockUSDC minted to vault)
    event YieldAccrued(uint256 yieldAmount, uint256 newTotalAssets);

    /// @dev Rate exceeds safe maximum
    error MockRateTooHigh(uint256 rateBps);

    /// @dev One or more address parameters resolved to the zero address
    error ZeroAddress();

    /// @dev MockUSDC must have 6 decimals (USDC standard)
    error InvalidDecimals(uint8 decimals);

    /// @dev Maximum allowed rate: 100% APY (10 000 bps)
    uint256 public constant MAX_RATE_BPS = 10_000;

    /**
     * @notice Deploy the mock-yield vault
     * @param asset_  The MockUSDC token address
     * @param owner_  The admin who controls rate and accrual
     */
    constructor(IERC20 asset_, address owner_)
        ERC4626(asset_)
        ERC20("OUCHUI Mock Yield Vault", "OMY")
        Ownable(owner_)
    {
        if (address(asset_) == address(0)) revert ZeroAddress();
        if (owner_ == address(0)) revert ZeroAddress();
        mockUsdc = IMockUSDC(address(asset_));
        // Vérifier que mockUsdc a bien 6 décimales (USDC standard)
        if (mockUsdc.decimals() != 6) {
            revert InvalidDecimals(mockUsdc.decimals());
        }
        lastAccrualTimestamp = block.timestamp;
    }

    /**
     * @notice Returns the number of decimals for the share token
     * @dev Matches the underlying asset (6 for MockUSDC)
     */
    function decimals() public view override(ERC4626) returns (uint8) {
        return mockUsdc.decimals();
    }

    // ── totalAssets() is NOT overridden ──
    // It uses the OZ default: MockUSDC.balanceOf(address(this)).
    // All yield is fully backed by minted MockUSDC.

    /**
     * @notice Set the mock annual yield rate
     * @param newRateBps Rate in basis points [0, 10 000]
     */
    function setMockRate(uint256 newRateBps) external onlyOwner {
        if (newRateBps > MAX_RATE_BPS) revert MockRateTooHigh(newRateBps);
        uint256 oldRate = mockRateBps;
        mockRateBps = newRateBps;
        emit MockRateUpdated(oldRate, newRateBps);
    }

    /**
     * @notice Accrue simulated yield by minting real MockUSDC to this vault
     * @dev Owner-only. Computes:
     *        yield = principal × mockRateBps × elapsed / (365 days × 10 000)
     *      where principal = totalAssets() = MockUSDC.balanceOf(this).
     *      Rounds DOWN so the vault never over-mints.
     *      Resets the accrual timestamp regardless of whether yield > 0.
     */
    function accrueYield() external onlyOwner {
        uint256 principal = totalAssets();
        uint256 elapsed = block.timestamp - lastAccrualTimestamp;

        // Always update the checkpoint, even if yield is zero
        lastAccrualTimestamp = block.timestamp;

        if (principal == 0 || mockRateBps == 0 || elapsed == 0) {
            return;
        }

        // yield = principal * rateBps * elapsed / (365 days * 10_000)
        // Using mulDiv to avoid overflow with large principals
        uint256 yieldAmount = principal.mulDiv(
            mockRateBps * elapsed,
            365 days * 10_000,
            Math.Rounding.Floor
        );

        if (yieldAmount == 0) {
            return;
        }

        // Mint real MockUSDC to this vault — fully backs the yield
        mockUsdc.mint(address(this), yieldAmount);

        emit YieldAccrued(yieldAmount, totalAssets());
    }
}
