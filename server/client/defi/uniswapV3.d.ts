import { ethers } from 'ethers';
export interface UniV3Position {
    protocol: string;
    type: string;
    chain: string;
    tokenId: number;
    token0Symbol: string;
    token1Symbol: string;
    token0Decimals: number;
    token1Decimals: number;
    fee: number;
    tickLower: number;
    tickUpper: number;
    liquidity: string;
    amount0: number;
    amount1: number;
    fees0: number;
    fees1: number;
}
export declare function getAmountsFromLiquidity(sqrtPriceX96: bigint, tickLower: number, tickUpper: number, liquidity: bigint, decimals0: number, decimals1: number): {
    amount0: number;
    amount1: number;
};
export declare function tickToSqrtPriceX96(tick: number): bigint;
/**
 * Fetch all Uniswap V3 LP positions for an address on a given chain.
 */
export declare function fetchUniswapV3Positions(chain: string, address: string, provider: ethers.Provider): Promise<UniV3Position[]>;
