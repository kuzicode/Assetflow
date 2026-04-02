import { ethers } from 'ethers';
import { createProvider } from '../config/chains.js';

const MORPHO_GRAPHQL_API = 'https://blue-api.morpho.org/graphql';
// Steakhouse Prime USDC on Base — https://app.morpho.org/base/vault/0xBEEFE94c8aD530842bfE7d8B397938fFc1cb83b2
const STEAKHOUSE_USDC_BASE = '0xBEEFE94c8aD530842bfE7d8B397938fFc1cb83b2';
const BASE_CHAIN_ID = 8453;

// Minimal ERC-4626 ABI for on-chain fallback APY computation
const ERC4626_ABI = [
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// In-memory store for on-chain share price snapshots (for fallback APY)
let sharePriceSnapshot: { price: bigint; ts: number } | null = null;

/**
 * Fetch Morpho MetaMorpho vault net APY.
 * Primary: Morpho GraphQL API (blue-api.morpho.org).
 * Fallback: On-chain share price delta (ERC-4626 convertToAssets).
 * Returns APY as a percentage (e.g. 5.81 means 5.81%).
 */
export async function fetchMorphoVaultApy(
  vaultAddress: string = STEAKHOUSE_USDC_BASE,
  chainId: number = BASE_CHAIN_ID
): Promise<number | null> {
  // --- Primary: Morpho GraphQL API ---
  try {
    const query = `{ vaultByAddress(address: "${vaultAddress}", chainId: ${chainId}) { state { apy netApy } } }`;
    const resp = await fetch(MORPHO_GRAPHQL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
    });
    if (resp.ok) {
      const data = await resp.json();
      const state = data?.data?.vaultByAddress?.state;
      if (state) {
        const apy = state.netApy ?? state.apy;
        if (apy != null) return apy * 100;
      }
    }
  } catch (_) {
    // fall through to on-chain
  }

  // --- Fallback: on-chain share price delta ---
  try {
    const provider = createProvider('base');
    const vault = new ethers.Contract(vaultAddress, ERC4626_ABI, provider);
    const decimals = Number(await vault.decimals());
    const unit = 10n ** BigInt(decimals);
    const currentPrice = await vault.convertToAssets(unit) as bigint;
    const now = Date.now();

    if (sharePriceSnapshot) {
      const daysDiff = (now - sharePriceSnapshot.ts) / (1000 * 60 * 60 * 24);
      if (daysDiff >= 0.5) {
        const growth = Number(currentPrice - sharePriceSnapshot.price) / Number(sharePriceSnapshot.price);
        const apy = (growth / daysDiff) * 365 * 100;
        sharePriceSnapshot = { price: currentPrice, ts: now };
        return apy;
      }
    }
    // First call — store snapshot, return null until next call
    sharePriceSnapshot = { price: currentPrice, ts: now };
  } catch (e: any) {
    console.error('[Morpho Vault] On-chain APY fallback failed:', e.message);
  }

  return null;
}

const VAULT_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function asset() view returns (address)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export interface MorphoVaultPosition {
  protocol: string;
  type: string;
  chain: string;
  vaultAddress: string;
  vaultName: string;
  symbol: string;
  amount: number;
}

/**
 * Fetch MetaMorpho (ERC-4626) vault positions.
 * These are vaults like "Steakhouse Prime USDC" or "Gauntlet USDC Prime"
 * that deposit into underlying Morpho Blue markets.
 */
export async function fetchMorphoVaultBalances(
  chain: string,
  address: string,
  provider: ethers.Provider,
  vaultAddresses: string[]
): Promise<MorphoVaultPosition[]> {
  const positions: MorphoVaultPosition[] = [];

  for (const vaultAddr of vaultAddresses) {
    try {
      const vault = new ethers.Contract(vaultAddr, VAULT_ABI, provider);

      // Get user's share balance
      const shares = await vault.balanceOf(address);
      if (shares === 0n) continue;

      // Convert shares to underlying assets and get vault info
      const [assets, assetAddr, vaultName, vaultDecimals] = await Promise.all([
        vault.convertToAssets(shares),
        vault.asset(),
        vault.name(),
        vault.decimals(),
      ]);

      // Get underlying token symbol
      const assetContract = new ethers.Contract(assetAddr, ERC20_ABI, provider);
      const [assetSymbol, assetDecimals] = await Promise.all([
        assetContract.symbol(),
        assetContract.decimals(),
      ]);

      const amount = parseFloat(ethers.formatUnits(assets, Number(assetDecimals)));

      if (amount > 0.01) {
        positions.push({
          protocol: 'Morpho Vault',
          type: 'Vault',
          chain,
          vaultAddress: vaultAddr,
          vaultName,
          symbol: assetSymbol,
          amount,
        });
      }
    } catch (e: any) {
      console.error(`[Morpho Vault] Error fetching vault ${vaultAddr}:`, e.message);
    }
  }

  return positions;
}
