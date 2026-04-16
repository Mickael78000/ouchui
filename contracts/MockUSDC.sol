// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @notice A mock ERC20 token simulating USDC with 6 decimals
 * @dev Mintable by owner or authorized minters for testing purposes.
 *      The minter role allows contracts (e.g. VaultMockYield) to self-mint
 *      yield tokens atomically without a multi-step external funding dance.
 */
contract MockUSDC is ERC20, Ownable {
    // USDC uses 6 decimals, unlike the standard 18
    uint8 private constant _DECIMALS = 6;

    /// @notice Addresses authorized to call mint() in addition to the owner
    mapping(address => bool) public minters;

    /// @dev Emitted when a minter is added or removed
    event MinterUpdated(address indexed account, bool status);

    /// @dev Caller is neither the owner nor an authorized minter
    error NotMinterOrOwner(address caller);

    /**
     * @notice Constructor initializes the token with name, symbol, and sets owner
     * @param initialOwner The address that will own the contract and can mint tokens
     */
    constructor(address initialOwner)
        ERC20("Mock USD Coin", "mUSDC")
        Ownable(initialOwner)
    {}

    /**
     * @notice Returns the number of decimals (6 for USDC compatibility)
     * @return uint8 The decimal places (6)
     */
    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /**
     * @notice Add or remove an authorized minter (owner only)
     * @param account The address to update
     * @param status  true to authorize, false to revoke
     */
    function setMinter(address account, bool status) external onlyOwner {
        minters[account] = status;
        emit MinterUpdated(account, status);
    }

    /**
     * @notice Mint tokens to a specified address (owner or authorized minter)
     * @param to The address to receive the minted tokens
     * @param amount The amount of tokens to mint (in 6 decimals)
     */
    function mint(address to, uint256 amount) external {
        if (msg.sender != owner() && !minters[msg.sender]) {
            revert NotMinterOrOwner(msg.sender);
        }
        _mint(to, amount);
    }
}
