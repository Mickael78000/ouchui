# OUCHUI Vault System

A dual-tranche ERC-4626 vault system built with Hardhat 3, using `mocha` for tests and `ethers.js` v6 for Ethereum interactions. This is an educational project demonstrating ERC-4626 vault behavior with yield strategies and auto-deployment mechanisms.

## Project Overview

This project implements a vault system with two independent ERC-4626 vaults sharing a common underlying asset (MockUSDC). It serves as a clean reference implementation for understanding:
- ERC-4626 deposit/mint/withdraw/redeem mechanics
- Share-to-asset conversion (1:1 and dynamic ratios)
- Multi-user vault isolation
- Access control patterns
- Yield strategy integration with auto-deployment

### What You'll Learn

- How ERC-4626 vaults work under the hood
- Relationship between shares and underlying assets
- Handling deposits and withdrawals with proper accounting
- Strategy vaults that auto-deploy to yield sources
- Testing edge cases (rounding, multi-user scenarios, allowance, yield accrual)

### Contracts

- **MockUSDC** (`contracts/MockUSDC.sol`): A mock ERC20 token with 6 decimals (USDC-compatible). Features a minters role system where authorized minters (including yield vaults) can mint tokens.
- **VaultMockYield** (`contracts/VaultMockYield.sol`): A mock yield-generating ERC-4626 vault that accrues yield via `accrueYield()`. Mints real MockUSDC as yield to increase `totalAssets`. Total assets = actual balance (fully backed, no virtual yield).
- **VaultT** (`contracts/VaultT.sol`): ERC-4626 vault for the "T" tranche with share token "OTV". **Strategy-aware**: auto-deploys deposits into VaultMockYield and pulls back on withdrawal. Total assets = idle balance + strategy.convertToAssets(strategyShares).
- **VaultD** (`contracts/VaultD.sol`): Simple ERC-4626 vault for the "D" tranche with share token "ODV". No strategy integration, maintains 1:1 share-to-asset ratio.

### Features

- ERC-4626 vault implementation using OpenZeppelin contracts v5
- 6-decimal precision matching USDC
- Strategy-aware vault (VaultT) with auto-deployment to yield sources
- Mock yield vault (VaultMockYield) with configurable rate and yield accrual
- Ownable pattern for administrative control
- Comprehensive test suite covering deposits, withdrawals, minting, redeeming, yield, and edge cases

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

This deploys MockUSDC → VaultMockYield → VaultT (with strategy) → VaultD in sequence.

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

### Demo Scripts

After deploying to Sepolia, use the demo scripts to interact with the contracts:

**Mint demo tokens:**
```shell
npx hardhat run scripts/mint-demo.ts --network sepolia
```

Mints 100,000 mUSDC to the deployer address.

**Prepare yield demo:**
```shell
npx hardhat run scripts/demo-prep.ts --network sepolia
```

Sets a 5% mock rate on VaultMockYield and accrues yield, then displays the TVL.

## Test Coverage

The test suite (`test/Vaults.ts`) includes:

- **Deployment tests**: Verify correct initialization of all contracts
- **MockUSDC operations**: Minting, transfers, minters role access control
- **VaultMockYield operations**: Deposits, yield accrual, rate setting, totalAssets tracking
- **VaultT ERC-4626 operations**: Deposits (auto-deploy to strategy), mints, withdrawals (pull from strategy), redeems
- **VaultD operations**: Independent vault functionality
- **Conversion functions**: 1:1 and dynamic ratio verification
- **Preview functions**: Deposit/mint preview accuracy
- **Rounding and precision**: Tests with odd amounts (1, 7, 999999, etc.)
- **Third-party operations**: Deposits/mints for different receiver than sender
- **Multi-user race scenarios**: Sequential deposits/withdrawals, isolation tests
- **Allowance edge cases**: Exact approval, partial consumption, infinite approval
- **Max functions**: maxDeposit, maxMint, maxWithdraw, maxRedeem behavior
- **Strategy integration**: Auto-deployment and withdrawal from VaultMockYield
- **Yield accrual**: Total assets growth after yield generation
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
  MockUSDC.sol              # Mock USDC token (6 decimals) with minters role
  VaultMockYield.sol        # Mock yield vault with accrueYield()
  VaultT.sol                # T-tranche vault (OTV shares) with strategy integration
  VaultD.sol                # D-tranche vault (ODV shares)
test/
  Vaults.ts                 # ERC-4626 integration tests (74 tests)
ignition/modules/
  OuchuiVaults.ts           # Deployment module
scripts/
  mint-demo.ts              # Mint demo tokens
  demo-prep.ts              # Set rate and accrue yield
hardhat.config.ts           # Hardhat 3 configuration
package.json                # Dependencies (OpenZeppelin v5, Hardhat 3)
```

## Notes

- Uses `.to.be.revert(ethers)` matcher syntax for Hardhat 3 compatibility (replaces deprecated `.reverted`)
- ESM modules enabled (`"type": "module"` in package.json)
- OZ ERC4626 hooks: Override `_deposit`/`_withdraw` (not `_transferIn`/`_transferOut`) for strategy logic
- Hardhat 3 API: Use `networkHelpers.time.increase(seconds)` not `increaseTime`
- VaultT strategy logic: Override internal `_deposit` and `_withdraw` hooks to handle auto-deployment to VaultMockYield
