// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
contract VaultT is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The strategy vault (VaultMockYield) where MockUSDC is deployed
    IERC4626 public immutable strategy;

    error ZeroAddress();
    error StrategyAssetMismatch();

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
        if (address(asset_) == address(0)) revert ZeroAddress();
        if (address(strategy_) == address(0)) revert ZeroAddress();
        if (owner_ == address(0)) revert ZeroAddress();
        // point 3 : vérification asset
        if (strategy_.asset() != address(asset_)) revert StrategyAssetMismatch();
        strategy = strategy_;
        IERC20(address(asset_)).forceApprove(address(strategy_), type(uint256).max);
    }

    /**
     * @notice ERC-4626 entry points — protected against reentrancy.
     * @dev VaultT performs external calls to the strategy vault (VaultMockYield)
     *      inside _deposit() and _withdraw():
     *        - _deposit() calls strategy.deposit() after pulling assets from the user
     *        - _withdraw() calls strategy.withdraw() before returning assets to the receiver
     *
     *      These cross-contract calls create a reentrancy surface: a malicious or
     *      upgradeable strategy could re-enter one of these functions before the
     *      state is fully settled. nonReentrant on all four public entry points
     *      closes this vector by reverting any re-entrant call within the same tx.
     *
     *      The underlying checks-effects-interactions order (inherited from OZ ERC-4626)
     *      is preserved; nonReentrant adds a second layer of defence.
     */

    function deposit(uint256 assets, address receiver)
        public override nonReentrant returns (uint256) {
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver)
        public override nonReentrant returns (uint256) {
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner_)
        public override nonReentrant returns (uint256) {
        return super.withdraw(assets, receiver, owner_);
    }

    function redeem(uint256 shares, address receiver, address owner_)
        public override nonReentrant returns (uint256) {
        return super.redeem(shares, receiver, owner_);
    }

    /**
     * @notice Total assets owned by VaultT = idle MockUSDC + deployed position
     * @dev deployed = strategy.convertToAssets(strategy.balanceOf(this))
     *      idle     = MockUSDC.balanceOf(this)
     */
    function totalAssets() public view override returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 deployed = strategy.convertToAssets(strategy.balanceOf(address(this)));
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