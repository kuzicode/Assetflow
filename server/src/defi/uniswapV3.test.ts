import { describe, it, expect } from 'vitest';
import { getAmountsFromLiquidity, tickToSqrtPriceX96 } from './uniswapV3.js';

describe('tickToSqrtPriceX96', () => {
  it('returns Q96 for tick 0 (price = 1.0)', () => {
    const Q96 = 2n ** 96n;
    const result = tickToSqrtPriceX96(0);
    // sqrt(1.0001^0) = 1.0, so result should be ~Q96
    expect(result).toBe(Q96);
  });

  it('increases monotonically with tick', () => {
    const low = tickToSqrtPriceX96(-1000);
    const mid = tickToSqrtPriceX96(0);
    const high = tickToSqrtPriceX96(1000);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  it('handles negative ticks', () => {
    const result = tickToSqrtPriceX96(-10000);
    expect(result).toBeGreaterThan(0n);
  });

  it('handles large positive ticks', () => {
    const result = tickToSqrtPriceX96(50000);
    expect(result).toBeGreaterThan(2n ** 96n);
  });
});

describe('getAmountsFromLiquidity', () => {
  // Use tick 0 as current price (sqrtPrice = Q96)
  const Q96 = 2n ** 96n;

  it('returns all token0 when price is below range', () => {
    // Current price at tick 0, range is [100, 200] — price below range
    const sqrtPrice = tickToSqrtPriceX96(0);
    const result = getAmountsFromLiquidity(sqrtPrice, 100, 200, 1000000n, 18, 18);
    expect(result.amount0).toBeGreaterThan(0);
    expect(result.amount1).toBe(0);
  });

  it('returns all token1 when price is above range', () => {
    // Current price at tick 1000, range is [100, 200] — price above range
    const sqrtPrice = tickToSqrtPriceX96(1000);
    const result = getAmountsFromLiquidity(sqrtPrice, 100, 200, 1000000n, 18, 18);
    expect(result.amount0).toBe(0);
    expect(result.amount1).toBeGreaterThan(0);
  });

  it('returns both tokens when price is in range', () => {
    // Current price at tick 150, range is [100, 200]
    const sqrtPrice = tickToSqrtPriceX96(150);
    const result = getAmountsFromLiquidity(sqrtPrice, 100, 200, 1000000n, 18, 18);
    expect(result.amount0).toBeGreaterThan(0);
    expect(result.amount1).toBeGreaterThan(0);
  });

  it('returns zero for zero liquidity', () => {
    const sqrtPrice = tickToSqrtPriceX96(150);
    const result = getAmountsFromLiquidity(sqrtPrice, 100, 200, 0n, 18, 18);
    expect(result.amount0).toBe(0);
    expect(result.amount1).toBe(0);
  });

  it('handles different decimals correctly', () => {
    // USDC/ETH style: 6 decimals vs 18 decimals
    const sqrtPrice = tickToSqrtPriceX96(150);
    const result6 = getAmountsFromLiquidity(sqrtPrice, 100, 200, 1000000n, 6, 18);
    const result18 = getAmountsFromLiquidity(sqrtPrice, 100, 200, 1000000n, 18, 18);
    // With fewer decimals for token0, the formatted amount should be larger
    expect(result6.amount0).toBeGreaterThan(result18.amount0);
  });

  it('handles wide tick ranges', () => {
    // ETH/USDC full range style
    const sqrtPrice = tickToSqrtPriceX96(0);
    const result = getAmountsFromLiquidity(sqrtPrice, -50000, 50000, 10n ** 18n, 18, 18);
    expect(result.amount0).toBeGreaterThan(0);
    expect(result.amount1).toBeGreaterThan(0);
  });
});
