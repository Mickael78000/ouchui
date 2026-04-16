// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VaultD
 * @notice ERC-4626 vault for the "D" tranche using MockUSDC as underlying
 * @dev Pure vault with no strategy; shares represent proportional claim on assets
 *
 * IMPORTANT: ERC-4626 share decimals default to the underlying asset's decimals (6).
 * This means 1 share = 1 underlying token when the vault has no yield/strategy.
 */
contract VaultD is ERC4626, Ownable {
    /**
     * @notice Constructor sets up the vault with underlying asset and metadata
     * @param asset_ The ERC20 token used as underlying (MockUSDC address)
     * @param owner_ The address that will own this vault
     */
    constructor(IERC20 asset_, address owner_) 
        ERC4626(asset_)
        ERC20("OUCHUI-D Vault Share", "ODV")
        Ownable(owner_)
    {}

    /**
     * @notice Returns the number of decimals for the share token
     * @dev Inherits from ERC4626 which uses the underlying asset's decimals (6 for USDC)
     * This keeps calculations simple: 1 share = 1 asset at 1:1 ratio
     */
    function decimals() public view override(ERC4626) returns (uint8) {
        return super.decimals();
    }
}