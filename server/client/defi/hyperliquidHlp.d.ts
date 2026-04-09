export interface HlpPosition {
    protocol: string;
    type: string;
    vaultAddress: string;
    equity: number;
    symbol: string;
    lockedUntilTimestamp: number;
}
/**
 * Fetch Hyperliquid HLP vault APY.
 * Uses apr field from vaultDetails if available, otherwise computes 30-day trailing annualized return.
 * Returns APY as a percentage (e.g. 12.3 means 12.3%).
 */
export declare function fetchHlpApy(): Promise<number | null>;
/**
 * Fetch Hyperliquid HLP vault equity for a user address.
 * Returns positions denominated in USDC.
 */
export declare function fetchHyperliquidHlpPositions(address: string): Promise<HlpPosition[]>;
