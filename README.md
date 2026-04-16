# OUCHUI Vault System

A minimal dual-tranche ERC-4626 vault system built with Hardhat 3, using `mocha` for tests and `ethers.js` v6 for Ethereum interactions. This is an educational project demonstrating pure ERC-4626 vault behavior without yield strategies or external integrations.

## Project Overview

This project implements a vault system with two independent ERC-4626 vaults sharing a common underlying asset (MockUSDC). It serves as a clean reference implementation for understanding:
- ERC-4626 deposit/mint/withdraw/redeem mechanics
- Share-to-asset conversion (1:1 ratio in this simple case)
- Multi-user vault isolation
- Access control patterns

### What You'll Learn

- How ERC-4626 vaults work under the hood
- Relationship between shares and underlying assets
- Handling deposits and withdrawals with proper accounting
- Testing edge cases (rounding, multi-user scenarios, allowance)

### Contracts

- **MockUSDC** (`contracts/MockUSDC.sol`): A mock ERC20 token with 6 decimals (USDC-compatible), mintable by the owner for testing purposes.
- **VaultT** (`contracts/VaultT.sol`): ERC-4626 vault for the "T" tranche with share token "OTV".
- **VaultD** (`contracts/VaultD.sol`): ERC-4626 vault for the "D" tranche with share token "ODV".

Both vaults use MockUSDC as the underlying asset and maintain a 1:1 share-to-asset ratio since they have no yield strategy.

### Features

- Pure ERC-4626 vault implementation using OpenZeppelin contracts v5
- 6-decimal precision matching USDC (shares = assets at 1:1 ratio)
- Ownable pattern for administrative control
- Comprehensive test suite covering deposits, withdrawals, minting, redeeming, and edge cases

## Prerequisites

- Node.js 18 or higher
- pnpm (or npm/yarn)

## Usage

### Install Dependencies

```shell
pnpm install
```

### Compile Contracts

```shell
npx hardhat build
```

### Run Tests

```shell
npx hardhat test
```

### Deploy Locally (Hardhat Ignition)

1. Start a local Hardhat node:
   ```shell
   npx hardhat node
   ```

2. In a separate terminal, deploy the vault system:
   ```shell
   npx hardhat ignition deploy ignition/modules/OuchuiVaults.ts --network localhost
   ```

This deploys MockUSDC, VaultT, and VaultD in sequence.

### Environment Variables

For Sepolia deployment, create a `.env` file in the project root:

```bash
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
SEPOLIA_PRIVATE_KEY=your_private_key_here
```

**Important:** Never commit your `.env` file. It contains sensitive credentials. The `.gitignore` already excludes `.env` files.

### Deploy to Sepolia (Hardhat Ignition)

With your `.env` configured:

```bash
npx hardhat ignition deploy ignition/modules/OuchuiVaults.ts --network sepolia
```

This deploys the vault system to the Sepolia testnet.

## Test Coverage

The test suite (`test/Vaults.ts`) includes:

- **Deployment tests**: Verify correct initialization of all contracts
- **MockUSDC operations**: Minting, transfers, access control
- **VaultT ERC-4626 operations**: Deposits, mints, withdrawals, redeems
- **VaultD operations**: Independent vault functionality
- **Conversion functions**: 1:1 ratio verification
- **Preview functions**: Deposit/mint preview accuracy
- **Rounding and precision**: Tests with odd amounts (1, 7, 999999, etc.)
- **Third-party operations**: Deposits/mints for different receiver than sender
- **Multi-user race scenarios**: Sequential deposits/withdrawals, isolation tests
- **Allowance edge cases**: Exact approval, partial consumption, infinite approval
- **Max functions**: maxDeposit, maxMint, maxWithdraw, maxRedeem behavior
- **Edge cases**: Zero amounts, insufficient balances, unauthorized access

## Technical Details

- **Solidity Version**: 0.8.30
- **Framework**: Hardhat 3
- **Testing**: Mocha + Chai with hardhat-ethers-chai-matchers v3
- **Library**: Ethers.js v6
- **Contracts**: OpenZeppelin Contracts v5.6.1

## Project Structure

```
contracts/
  MockUSDC.sol              # Mock USDC token (6 decimals)
  VaultT.sol                # T-tranche vault (OTV shares)
  VaultD.sol                # D-tranche vault (ODV shares)
test/
  Vaults.ts                 # ERC-4626 integration tests
ignition/modules/
  OuchuiVaults.ts           # Deployment module (MockUSDC → VaultT → VaultD)
hardhat.config.ts           # Hardhat 3 configuration
package.json                # Dependencies (OpenZeppelin v5, Hardhat 3)
```

## Notes

- Uses `.to.be.revert(ethers)` matcher syntax for Hardhat 3 compatibility (replaces deprecated `.reverted`)
- ESM modules enabled (`"type": "module"` in package.json)
