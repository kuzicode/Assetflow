import { ethers } from 'ethers';
import { UNISWAP_V3_POSITION_MANAGER, UNISWAP_V3_FACTORY } from '../config/defi.js';

const MAX_UINT128 = 2n ** 128n - 1n;

const POSITION_MANAGER_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) params) returns (uint256 amount0, uint256 amount1)',
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

/** Well-known mainnet token metadata — avoids RPC calls for tokens with non-standard ABIs (e.g. USDT bytes32 symbol). */
const KNOWN_TOKEN_META: Record<string, { symbol: string; decimals: number }> = {
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8 },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },
  '0x514910771af9ca656af840dff83e8264ecf986ca': { symbol: 'LINK', decimals: 18 },
};

/**
 * Get token symbol — checks well-known cache first, falls back to RPC with bytes32 fallback (USDT etc.).
 */
async function getTokenSymbol(provider: ethers.Provider, tokenAddr: string): Promise<string> {
  const known = KNOWN_TOKEN_META[tokenAddr.toLowerCase()];
  if (known) return known.symbol;

  const abi = ['function symbol() view returns (string)'];
  const contract = new ethers.Contract(tokenAddr, abi, provider);
  try {
    return await withRetry(() => contract.symbol());
  } catch {
    try {
      const raw = await provider.call({ to: tokenAddr, data: '0x95d89b41' });
      if (raw && raw.length >= 66) {
        return ethers.decodeBytes32String('0x' + raw.slice(2, 66)).replace(/\0/g, '');
      }
    } catch {}
    return 'UNKNOWN';
  }
}

async function getTokenDecimals(provider: ethers.Provider, tokenAddr: string): Promise<number> {
  const known = KNOWN_TOKEN_META[tokenAddr.toLowerCase()];
  if (known) return known.decimals;

  const abi = ['function decimals() view returns (uint8)'];
  const contract = new ethers.Contract(tokenAddr, abi, provider);
  try {
    return Number(await withRetry(() => contract.decimals()));
  } catch {
    try {
      const raw = await provider.call({ to: tokenAddr, data: '0x313ce567' });
      if (raw && raw !== '0x') return Number(ethers.toBigInt(raw));
    } catch {}
    return 18;
  }
}

/**
 * Retry a thunk up to maxAttempts times with exponential backoff.
 * Only retries on CALL_EXCEPTION with null data (RPC-level null response / rate limit).
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 800): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      // Only retry on RPC-level null response; propagate real contract reverts
      if (err?.code === 'CALL_EXCEPTION' && err?.data === null) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
      } else {
        throw err;
      }
    }
  }
  throw lastErr;
}

/**
 * Fetch all Uniswap V3 LP positions for an address on a given chain.
 */
export async function fetchUniswapV3Positions(
  chain: string,
  address: string,
  provider: ethers.Provider
): Promise<UniV3Position[]> {
  const nftAddr = UNISWAP_V3_POSITION_MANAGER[chain];
  const factoryAddr = UNISWAP_V3_FACTORY[chain];
  if (!nftAddr || !factoryAddr) return [];

  const positions: UniV3Position[] = [];

  try {
    const nft = new ethers.Contract(nftAddr, POSITION_MANAGER_ABI, provider);
    const factory = new ethers.Contract(factoryAddr, FACTORY_ABI, provider);

    // Get number of positions
    const balance = await withRetry(() => nft.balanceOf(address));
    const count = Number(balance);
    if (count === 0) return [];

    // Fetch each position (sequential with delay to avoid RPC rate limiting)
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const tokenIds: number[] = [];
    for (let i = 0; i < count; i++) {
      if (i > 0) await sleep(400);
      const tokenId = await withRetry(() => nft.tokenOfOwnerByIndex(address, i));
      tokenIds.push(Number(tokenId));
    }

    // Sequential (not concurrent) to avoid Alchemy rate-limit on busy nodes
    for (const tokenId of tokenIds) {
      await sleep(300);
      try {
          const pos = await withRetry(() => nft.positions(tokenId));
          const liquidity = pos.liquidity;

          // Skip closed positions (zero liquidity and no owed fees)
          if (liquidity === 0n && pos.tokensOwed0 === 0n && pos.tokensOwed1 === 0n) continue;

          // Get token info — use helpers that handle bytes32 symbol (e.g. USDT)
          const [decimals0, symbol0, decimals1, symbol1] = await Promise.all([
            getTokenDecimals(provider, pos.token0),
            getTokenSymbol(provider, pos.token0),
            getTokenDecimals(provider, pos.token1),
            getTokenSymbol(provider, pos.token1),
          ]);

          let amount0 = 0;
          let amount1 = 0;

          if (liquidity > 0n) {
            // Get pool and current price
            const poolAddr = await withRetry(() => factory.getPool(pos.token0, pos.token1, pos.fee));
            if (poolAddr !== ethers.ZeroAddress) {
              const pool = new ethers.Contract(poolAddr, POOL_ABI, provider);
              const slot0 = await withRetry(() => pool.slot0());

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

          // Unclaimed fees — use collect staticCall to get all pending fees (including pool-accrued)
          let fees0 = 0;
          let fees1 = 0;
          try {
            const collected = await withRetry(() => nft.collect.staticCall(
              { tokenId, recipient: address, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 },
              { from: address }
            ));
            fees0 = parseFloat(ethers.formatUnits(collected.amount0, Number(decimals0)));
            fees1 = parseFloat(ethers.formatUnits(collected.amount1, Number(decimals1)));
          } catch (feeErr: any) {
            console.warn(`[UniV3] collect.staticCall failed for tokenId=${tokenId}: ${feeErr.message?.slice(0, 80)}, falling back to tokensOwed`);
            fees0 = parseFloat(ethers.formatUnits(pos.tokensOwed0, Number(decimals0)));
            fees1 = parseFloat(ethers.formatUnits(pos.tokensOwed1, Number(decimals1)));
          }

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
    }
  } catch (e: any) {
    console.error(`[Uniswap V3] Failed for ${chain}:`, e.message);
  }

  return positions;
}
