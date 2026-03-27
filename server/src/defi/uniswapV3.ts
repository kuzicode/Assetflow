import { ethers } from 'ethers';
import { UNISWAP_V3_POSITION_MANAGER, UNISWAP_V3_FACTORY } from '../config/defi.js';

const POSITION_MANAGER_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
];

const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)',
];

const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
];

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

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

// Uniswap V3 math: calculate token amounts from liquidity and tick range
export function getAmountsFromLiquidity(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
  decimals0: number,
  decimals1: number
): { amount0: number; amount1: number } {
  const Q96 = 2n ** 96n;

  const sqrtA = tickToSqrtPriceX96(tickLower);
  const sqrtB = tickToSqrtPriceX96(tickUpper);
  const sqrtPrice = sqrtPriceX96;

  let amount0 = 0n;
  let amount1 = 0n;

  if (sqrtPrice <= sqrtA) {
    // All token0
    amount0 = (liquidity * Q96 * (sqrtB - sqrtA)) / (sqrtA * sqrtB);
  } else if (sqrtPrice < sqrtB) {
    // Both tokens
    amount0 = (liquidity * Q96 * (sqrtB - sqrtPrice)) / (sqrtPrice * sqrtB);
    amount1 = (liquidity * (sqrtPrice - sqrtA)) / Q96;
  } else {
    // All token1
    amount1 = (liquidity * (sqrtB - sqrtA)) / Q96;
  }

  return {
    amount0: parseFloat(ethers.formatUnits(amount0, decimals0)),
    amount1: parseFloat(ethers.formatUnits(amount1, decimals1)),
  };
}

export function tickToSqrtPriceX96(tick: number): bigint {
  // sqrt(1.0001^tick) * 2^96
  const sqrtRatio = Math.sqrt(1.0001 ** tick);
  return BigInt(Math.round(sqrtRatio * Number(2n ** 96n)));
}

/**
 * Fetch all Uniswap V3 LP positions for an address on a given chain.
 */
export async function fetchUniswapV3Positions(
  chain: string,
  address: string,
  provider: ethers.JsonRpcProvider
): Promise<UniV3Position[]> {
  const nftAddr = UNISWAP_V3_POSITION_MANAGER[chain];
  const factoryAddr = UNISWAP_V3_FACTORY[chain];
  if (!nftAddr || !factoryAddr) return [];

  const positions: UniV3Position[] = [];

  try {
    const nft = new ethers.Contract(nftAddr, POSITION_MANAGER_ABI, provider);
    const factory = new ethers.Contract(factoryAddr, FACTORY_ABI, provider);

    // Get number of positions
    const balance = await nft.balanceOf(address);
    const count = Number(balance);
    if (count === 0) return [];

    // Fetch each position
    const tokenIds: number[] = [];
    for (let i = 0; i < count; i++) {
      const tokenId = await nft.tokenOfOwnerByIndex(address, i);
      tokenIds.push(Number(tokenId));
    }

    await Promise.all(
      tokenIds.map(async (tokenId) => {
        try {
          const pos = await nft.positions(tokenId);
          const liquidity = pos.liquidity;

          // Skip closed positions (zero liquidity and no owed fees)
          if (liquidity === 0n && pos.tokensOwed0 === 0n && pos.tokensOwed1 === 0n) return;

          // Get token info
          const token0Contract = new ethers.Contract(pos.token0, ERC20_ABI, provider);
          const token1Contract = new ethers.Contract(pos.token1, ERC20_ABI, provider);

          const [decimals0, symbol0, decimals1, symbol1] = await Promise.all([
            token0Contract.decimals(),
            token0Contract.symbol(),
            token1Contract.decimals(),
            token1Contract.symbol(),
          ]);

          let amount0 = 0;
          let amount1 = 0;

          if (liquidity > 0n) {
            // Get pool and current price
            const poolAddr = await factory.getPool(pos.token0, pos.token1, pos.fee);
            if (poolAddr !== ethers.ZeroAddress) {
              const pool = new ethers.Contract(poolAddr, POOL_ABI, provider);
              const slot0 = await pool.slot0();

              const amounts = getAmountsFromLiquidity(
                slot0.sqrtPriceX96,
                Number(pos.tickLower),
                Number(pos.tickUpper),
                liquidity,
                Number(decimals0),
                Number(decimals1)
              );
              amount0 = amounts.amount0;
              amount1 = amounts.amount1;
            }
          }

          // Unclaimed fees
          const fees0 = parseFloat(ethers.formatUnits(pos.tokensOwed0, Number(decimals0)));
          const fees1 = parseFloat(ethers.formatUnits(pos.tokensOwed1, Number(decimals1)));

          positions.push({
            protocol: 'Uniswap V3',
            type: 'LP',
            chain,
            tokenId,
            token0Symbol: symbol0,
            token1Symbol: symbol1,
            token0Decimals: Number(decimals0),
            token1Decimals: Number(decimals1),
            fee: Number(pos.fee),
            tickLower: Number(pos.tickLower),
            tickUpper: Number(pos.tickUpper),
            liquidity: liquidity.toString(),
            amount0,
            amount1,
            fees0,
            fees1,
          });
        } catch (e: any) {
          console.error(`[Uniswap V3] Error fetching position ${tokenId}:`, e.message);
        }
      })
    );
  } catch (e: any) {
    console.error(`[Uniswap V3] Failed for ${chain}:`, e.message);
  }

  return positions;
}
