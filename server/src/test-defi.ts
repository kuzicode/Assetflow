/**
 * Test script to verify DeFi integrations with real wallets.
 *
 * Wallet 1: 0x7C6Ef14F6890D0fdA17fB8E4Fb6F649F0355c3BE
 *   - Uniswap V3 LP positions
 *   - Hyperliquid HLP vault
 *
 * Wallet 2: 0xf0777e27c50eaa9a6cb2255b0aa3ee21e35aad84
 *   - Uniswap V3 LP positions
 *   - Morpho Blue (Base chain)
 *
 * Run: npx tsx src/test-defi.ts
 */

import { createProvider } from './config/chains.js';
import { fetchUniswapV3Positions } from './defi/uniswapV3.js';
import { fetchAaveV3Balances } from './defi/aaveV3.js';
import { fetchMorphoBlueBalances } from './defi/morphoBlue.js';
import { fetchMorphoVaultBalances } from './defi/morphoVault.js';
import { fetchHyperliquidHlpPositions } from './defi/hyperliquidHlp.js';
import { fetchEvmBalances } from './defi/evmBalance.js';
import { getBaseTokenGroup } from './config/chains.js';

const WALLET_1 = '0x7C6Ef14F6890D0fdA17fB8E4Fb6F649F0355c3BE';
const WALLET_2 = '0xf0777e27c50eaa9a6cb2255b0aa3ee21e35aad84';

async function testSection(name: string, fn: () => Promise<void>) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${name}`);
  console.log('='.repeat(60));
  try {
    await fn();
  } catch (e: any) {
    console.error(`  ❌ FAILED: ${e.message}`);
  }
}

async function main() {
  console.log('🔍 Assetflow DeFi Integration Test');
  console.log(`   Wallet 1: ${WALLET_1}`);
  console.log(`   Wallet 2: ${WALLET_2}`);

  // ─── Test 1: Hyperliquid HLP (Wallet 1) ───
  await testSection('Hyperliquid HLP — Wallet 1', async () => {
    const positions = await fetchHyperliquidHlpPositions(WALLET_1);
    if (positions.length === 0) {
      console.log('  ⚠️  No HLP positions found');
    } else {
      for (const p of positions) {
        console.log(`  ✅ Vault: ${p.vaultAddress}`);
        console.log(`     Equity: ${p.equity.toFixed(2)} ${p.symbol}`);
        console.log(`     Group: ${getBaseTokenGroup(p.symbol)}`);
        console.log(`     Locked until: ${p.lockedUntilTimestamp > 0 ? new Date(p.lockedUntilTimestamp).toISOString() : 'N/A'}`);
      }
    }
  });

  // ─── Test 2: Uniswap V3 LP (Wallet 1) ───
  const chainsToTest = ['ethereum', 'arbitrum', 'base'];

  await testSection('Uniswap V3 LP — Wallet 1', async () => {
    let found = false;
    for (const chain of chainsToTest) {
      const provider = createProvider(chain);
      if (!provider) continue;
      const positions = await fetchUniswapV3Positions(chain, WALLET_1, provider);
      if (positions.length > 0) {
        found = true;
        console.log(`  📍 ${chain}: ${positions.length} position(s)`);
        for (const p of positions) {
          console.log(`     #${p.tokenId} ${p.token0Symbol}/${p.token1Symbol} (fee: ${p.fee / 10000}%)`);
          console.log(`       Amount0: ${p.amount0.toFixed(6)} ${p.token0Symbol} → Group: ${getBaseTokenGroup(p.token0Symbol)}`);
          console.log(`       Amount1: ${p.amount1.toFixed(6)} ${p.token1Symbol} → Group: ${getBaseTokenGroup(p.token1Symbol)}`);
          console.log(`       Fees0: ${p.fees0.toFixed(6)} ${p.token0Symbol}`);
          console.log(`       Fees1: ${p.fees1.toFixed(6)} ${p.token1Symbol}`);
        }
      }
    }
    if (!found) console.log('  ⚠️  No Uniswap V3 positions found on any chain');
  });

  // ─── Test 3: Uniswap V3 LP (Wallet 2) ───
  await testSection('Uniswap V3 LP — Wallet 2', async () => {
    let found = false;
    for (const chain of chainsToTest) {
      const provider = createProvider(chain);
      if (!provider) continue;
      const positions = await fetchUniswapV3Positions(chain, WALLET_2, provider);
      if (positions.length > 0) {
        found = true;
        console.log(`  📍 ${chain}: ${positions.length} position(s)`);
        for (const p of positions) {
          console.log(`     #${p.tokenId} ${p.token0Symbol}/${p.token1Symbol} (fee: ${p.fee / 10000}%)`);
          console.log(`       Amount0: ${p.amount0.toFixed(6)} ${p.token0Symbol} → Group: ${getBaseTokenGroup(p.token0Symbol)}`);
          console.log(`       Amount1: ${p.amount1.toFixed(6)} ${p.token1Symbol} → Group: ${getBaseTokenGroup(p.token1Symbol)}`);
          console.log(`       Fees0: ${p.fees0.toFixed(6)} ${p.token0Symbol}`);
          console.log(`       Fees1: ${p.fees1.toFixed(6)} ${p.token1Symbol}`);
        }
      }
    }
    if (!found) console.log('  ⚠️  No Uniswap V3 positions found on any chain');
  });

  // ─── Test 4: Morpho Vaults on Base (Wallet 2) ───
  await testSection('Morpho Vaults (Base) — Wallet 2', async () => {
    const provider = createProvider('base');
    if (!provider) {
      console.log('  ⚠️  No Base RPC configured');
      return;
    }

    const vaultAddresses = [
      '0xBEEFE94c8aD530842bfE7d8B397938fFc1cb83b2', // Steakhouse Prime USDC
      '0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61', // Gauntlet USDC Prime
    ];

    const positions = await fetchMorphoVaultBalances('base', WALLET_2, provider, vaultAddresses);
    if (positions.length === 0) {
      console.log('  ⚠️  No Morpho Vault positions found');
    } else {
      for (const p of positions) {
        console.log(`  ✅ ${p.vaultName}`);
        console.log(`     Amount: ${p.amount.toFixed(6)} ${p.symbol}`);
        console.log(`     Vault: ${p.vaultAddress}`);
        console.log(`     Group: ${getBaseTokenGroup(p.symbol)}`);
      }
    }
  });

  // ─── Test 5: AAVE V3 (both wallets, key chains) ───
  await testSection('AAVE V3 — Both wallets', async () => {
    for (const [label, addr] of [['Wallet 1', WALLET_1], ['Wallet 2', WALLET_2]]) {
      for (const chain of chainsToTest) {
        const provider = createProvider(chain);
        if (!provider) continue;
        const positions = await fetchAaveV3Balances(chain, addr, provider);
        if (positions.length > 0) {
          console.log(`  📍 ${label} on ${chain}:`);
          for (const p of positions) {
            const sign = p.isDebt ? '(DEBT)' : '(SUPPLY)';
            console.log(`     ${sign} ${p.amount.toFixed(6)} ${p.symbol} → Group: ${getBaseTokenGroup(p.symbol)}`);
          }
        }
      }
    }
  });

  // ─── Test 6: EVM Balances (both wallets, subset of chains) ───
  await testSection('EVM Balances — Both wallets', async () => {
    for (const [label, addr] of [['Wallet 1', WALLET_1], ['Wallet 2', WALLET_2]]) {
      const balances = await fetchEvmBalances(addr, ['ethereum', 'arbitrum', 'base']);
      if (balances.length > 0) {
        console.log(`  📍 ${label}:`);
        for (const b of balances) {
          console.log(`     ${b.chain}: ${b.amount.toFixed(6)} ${b.symbol} (${b.type}) → Group: ${getBaseTokenGroup(b.symbol)}`);
        }
      } else {
        console.log(`  ⚠️  ${label}: No balances found`);
      }
    }
  });

  // ─── Summary ───
  console.log(`\n${'='.repeat(60)}`);
  console.log('  ✅ Test complete');
  console.log('='.repeat(60));
}

main().catch(console.error);
