import { ethers } from 'ethers';
/**
 * Fetch Morpho MetaMorpho vault net APY.
 * Primary: Morpho GraphQL API (blue-api.morpho.org).
 * Fallback: On-chain share price delta (ERC-4626 convertToAssets).
 * Returns APY as a percentage (e.g. 5.81 means 5.81%).
 */
export declare function fetchMorphoVaultApy(vaultAddress?: string, chainId?: number): Promise<number | null>;
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
export declare function fetchMorphoVaultBalances(chain: string, address: string, provider: ethers.Provider, vaultAddresses: string[]): Promise<MorphoVaultPosition[]>;
