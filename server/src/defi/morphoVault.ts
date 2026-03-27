import { ethers } from 'ethers';

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
  provider: ethers.JsonRpcProvider,
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
