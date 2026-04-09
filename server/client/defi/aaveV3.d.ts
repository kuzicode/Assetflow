import { ethers } from 'ethers';
export interface AavePosition {
    protocol: string;
    type: string;
    chain: string;
    symbol: string;
    amount: number;
    isDebt: boolean;
}
/**
 * Fetch AAVE V3 USDC supply APY on Ethereum mainnet.
 * Uses Pool.getReserveData(usdcAddress) directly — same approach as reference monitor.
 * Returns APY as a percentage (e.g. 3.52 means 3.52%).
 */
export declare function fetchAaveUsdcSupplyApy(): Promise<number | null>;
/**
 * Fetch Aave V3 supply and borrow positions for an address.
 * Uses liquidityIndex to convert scaledATokenBalance → actual balance.
 */
export declare function fetchAaveV3Balances(chain: string, address: string, provider: ethers.Provider): Promise<AavePosition[]>;
