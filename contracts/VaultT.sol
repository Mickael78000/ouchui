// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VaultT
 * @notice ERC-4626 vault for the "T" tranche using MockUSDC as underlying.
 * @dev VaultT is a strategy-aware vault. On deposit/mint it auto-deploys
 *      received MockUSDC into VaultMockYield. On withdraw/redeem it pulls
 *      MockUSDC back from VaultMockYield before paying the user.
 *
 *      Assets held by VaultT:
 *        idle     = MockUSDC.balanceOf(address(this))          (normally ~0)
 *        deployed = strategy.convertToAssets(strategy.balanceOf(address(this)))
 *        totalAssets() = idle + deployed
 *
 *      VaultT holds VaultMockYield shares as its strategy position.
 *      It NEVER counts non-owned assets or protocol-wide balances.
 *
 *      Share decimals match MockUSDC (6).
 */
contract VaultT is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    /// @notice The strategy vault (VaultMockYield) where MockUSDC is deployed
    IERC4626 public immutable strategy;

    /// @dev Strategy address must not be zero
    error StrategyZeroAddress();

    /**
     * @notice Deploy the T-tranche vault
     * @param asset_    The MockUSDC token address
     * @param strategy_ The VaultMockYield vault address
     * @param owner_    The vault owner
     */
    constructor(IERC20 asset_, IERC4626 strategy_, address owner_)
        ERC4626(asset_)
        ERC20("OUCHUI-T Vault Share", "OTV")
        Ownable(owner_)
    {
        if (address(strategy_) == address(0)) revert StrategyZeroAddress();
        strategy = strategy_;
        // Pre-approve strategy to spend MockUSDC held by this vault
        asset_.approve(address(strategy_), type(uint256).max);
    }

    /**
     * @notice Returns the number of decimals for the share token
     * @dev Matches the underlying asset (6 for MockUSDC)
     */
    function decimals() public view override(ERC4626) returns (uint8) {
        return super.decimals();
    }

    /**
     * @notice Total assets owned by VaultT = idle MockUSDC + deployed position
     * @dev deployed = strategy.convertToAssets(strategy.balanceOf(this))
     *      idle     = MockUSDC.balanceOf(this)
     */
    function totalAssets() public view override returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 strategyShares = IERC20(address(strategy)).balanceOf(address(this));
        uint256 deployed = strategyShares > 0
            ? strategy.convertToAssets(strategyShares)
            : 0;
        return idle + deployed;
    }

    /**
     * @dev After the standard ERC-4626 deposit (pull MockUSDC from user, mint
     *      VaultT shares), deploy all idle MockUSDC into VaultMockYield.
     */
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override {
        // Standard ERC-4626: transferFrom caller → this, then mint shares
        super._deposit(caller, receiver, assets, shares);
        // Deploy idle MockUSDC into strategy
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle > 0) {
            strategy.deposit(idle, address(this));
        }
    }

    /**
     * @dev Before the standard ERC-4626 withdraw (burn shares, transfer MockUSDC
     *      to receiver), pull enough MockUSDC from VaultMockYield.
     */
    function _withdraw(
        address caller,
        address receiver,
        address owner_,
        uint256 assets,
        uint256 shares
    ) internal override {
        // Pull MockUSDC from strategy if idle balance is insufficient
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle < assets) {
            uint256 needed = assets - idle;
            strategy.withdraw(needed, address(this), address(this));
        }
        // Standard ERC-4626: burn shares from owner_, transfer assets to receiver
        super._withdraw(caller, receiver, owner_, assets, shares);
    }
}