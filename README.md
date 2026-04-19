Système de Vaults OUCHUI

Un système de vaults ERC-4626 à double tranche construit avec **Hardhat 3**, utilisant `mocha` pour les tests et `ethers.js` v6 pour les interactions Ethereum. Projet éducatif démontrant le comportement des vaults ERC-4626 avec stratégies de rendement et mécanismes d'auto-déploiement.

## Aperçu du Projet

Ce projet implémente un système de vaults avec **deux vaults ERC-4626 indépendants** partageant un actif sous-jacent commun (MockUSDC). Il sert de référence claire pour comprendre :

- Mécaniques ERC-4626 : `deposit/mint/withdraw/redeem`
- Conversion part-vers-actif (ratio 1:1 et dynamique)
- Isolation multi-utilisateurs
- Patterns de contrôle d'accès
- Intégration de stratégies de rendement avec auto-déploiement

## Contrats

| Contrat | Fichier | Description |
| --- | --- | --- |
| **MockUSDC** | `contracts/MockUSDC.sol` | Token ERC20 mock (6 décimales, compatible USDC) avec système de rôles minters |
| **VaultMockYield** | `contracts/VaultMockYield.sol` | Vault ERC-4626 générant du rendement mock via `accrueYield()`. Total assets = balance réelle |
| **VaultT** | `contracts/VaultT.sol` | Vault "T-tranche" (parts "OTV"). **Stratégique** : auto-déploie vers VaultMockYield |
| **VaultD** | `contracts/VaultD.sol` | Vault "D-tranche" simple (parts "ODV"). Ratio 1:1 sans stratégie |

### Fonctionnalités Clés

```
✅ ERC-4626 complet (OpenZeppelin v5)
✅ Précision 6 décimales (USDC)
✅ Vault stratégique (VaultT) avec auto-déploiement
✅ Yield mock configurable (VaultMockYield)
✅ Contrôle d'accès Ownable
✅ Suite de tests complète (77 tests + 3 fuzz)
✅ Protection donation attack (virtual shares OZ)
✅ Isolation cross-vault
```

## Prérequis

- **Node.js 18+**
- **pnpm** (ou npm/yarn)

## Installation \& Usage

### 1. Installation

```bash
pnpm install
```

### 2. Compilation

```bash
npx hardhat build
```

### 3. Tests (77 tests + fuzz)

```bash
npx hardhat test                    # Unitaires + Fuzzing
npx hardhat coverage                # Couverture ≥95%
```

### 4. Déploiement Local

```bash
# Terminal 1 : nœud local
npx hardhat node

# Terminal 2 : déploiement
npx hardhat ignition deploy ignition/modules/OuchuiVaults.ts --network localhost
```

### 5. Déploiement Sepolia

```bash
# Configurer .env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
SEPOLIA_PRIVATE_KEY=...

# Déployer
npx hardhat ignition deploy ignition/modules/OuchuiVaults.ts --network sepolia
```

### 6. Scripts Démo (Sepolia)

```bash
npx hardhat run scripts/mint-demo.ts --network sepolia      # Mint 100k mUSDC
npx hardhat run scripts/demo-prep.ts --network sepolia      # Config yield 5%
```

## Couverture Tests (77 tests)

| Catégorie | Tests | Couverture |
| --- | --- | --- |
| **Core ERC-4626** | 35  | deposit/mint/withdraw/redeem x3 vaults |
| **Stratégie VaultT** | 20  | Auto-deploy, rapatriement, totalAssets |
| **Yield Mock** | 12  | Rate, accrual temporel, revert non-owner |
| **Sécurité** | 10  | Ownable, donation attack, isolation |
| **Edge Cases** | 15  | Zéro, décimales, multi-users |
| **Fuzz Tests** | **3** | Montants aléatoires VaultD/VaultT |

**Assertions critiques** :

```
✅ totalAssets() == balance réelle (fully backed)
✅ Previews exacts avant/après yield
✅ Virtual shares protègent donation attacks
✅ Isolation VaultD ↔ VaultT
✅ Décimales 6 (1 wei → 999999 USDC)
```

## Détails Techniques

```
• Solidity : 0.8.30
• Hardhat : 3.x (NetworkManager v3)
• Testing : Mocha + Chai + ethers-chai-matchers v3
• Ethers.js : v6
• OpenZeppelin : v5.6.1
• ESM modules activés
• Hardhat Ignition pour déploiement
```

## Structure Projet

```
contracts/
├── MockUSDC.sol              # USDC mock (6 décimales + minters)
├── VaultMockYield.sol        # Yield mock (accrueYield())
├── VaultT.sol               # T-tranche (stratégie auto)
└── VaultD.sol               # D-tranche (simple 1:1)

test/
└── Vaults.ts                # 77 tests + 3 fuzz

ignition/modules/
└── OuchuiVaults.ts          # Déploiement séquentiel

scripts/
├── mint-demo.ts             # Mint démo
└── demo-prep.ts             # Config yield
```

## Notes Importantes

```
🔸 Hardhat 3 : networkHelpers.time.increase()
🔸 ERC4626 hooks : _deposit/_withdraw (pas _transferIn)
🔸 Matchers : .revertedWithCustomError() 
🔸 Fuzz natif : npx hardhat test --fuzz-runs 1000
🔸 Couverture : npx hardhat coverage (cible ≥95%)
```

