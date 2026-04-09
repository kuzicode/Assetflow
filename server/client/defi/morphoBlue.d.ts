import { ethers } from 'ethers';
export interface MorphoPosition {
    protocol: string;
    type: string;
    chain: string;
    symbol: string;
    amount: number;
    marketId: string;
    isDebt: boolean;
}
/**
 * Fetch Morpho Blue supply/borrow positions for given market IDs.
 * Market IDs must be pre-configured (stored in settings or passed in).
 */
export declare function fetchMorphoBlueBalances(chain: string, address: string, provider: ethers.Provider, marketIds: string[]): Promise<MorphoPosition[]>;
