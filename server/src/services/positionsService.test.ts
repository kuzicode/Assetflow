import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetchEvmBalances, mockFetchPrices } = vi.hoisted(() => ({
  mockFetchEvmBalances: vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return [{ symbol: 'ETH', chain: 'ethereum', amount: 2 }];
  }),
  mockFetchPrices: vi.fn(async () => ({
    prices: {},
    missingSymbols: ['ETH'],
    partialFailureSources: ['binance'],
    timestamp: new Date().toISOString(),
  })),
}));

vi.mock('../repositories/walletsRepo.js', () => ({
  listWalletRows: () => [{ id: 'wallet-1', label: 'Main', address: '0x1234', chains_json: '["ethereum"]' }],
}));
vi.mock('../repositories/manualAssetsRepo.js', () => ({
  listManualAssetRows: () => [],
}));
vi.mock('../repositories/settingsRepo.js', () => ({
  getSetting: () => undefined,
}));
vi.mock('../defi/evmBalance.js', () => ({
  fetchEvmBalances: mockFetchEvmBalances,
}));
vi.mock('../defi/uniswapV3.js', () => ({
  fetchUniswapV3Positions: vi.fn(async () => []),
}));
vi.mock('../defi/aaveV3.js', () => ({
  fetchAaveV3Balances: vi.fn(async () => []),
}));
vi.mock('../defi/morphoBlue.js', () => ({
  fetchMorphoBlueBalances: vi.fn(async () => []),
}));
vi.mock('../defi/morphoVault.js', () => ({
  fetchMorphoVaultBalances: vi.fn(async () => []),
}));
vi.mock('../defi/hyperliquidHlp.js', () => ({
  fetchHyperliquidHlpPositions: vi.fn(async () => []),
}));
vi.mock('../defi/okx.js', () => ({
  fetchOKXTokenBalances: vi.fn(),
  fetchOKXDeFiPositions: vi.fn(),
}));
vi.mock('../config/chains.js', async () => {
  const actual = await vi.importActual('../config/chains.js');
  return {
    ...actual,
    createProvider: () => null,
  };
});
vi.mock('../utils/price.js', () => ({
  fetchPrices: mockFetchPrices,
}));

const { getPositionsSnapshot, invalidatePositionsSnapshotCache } = await import('./positionsService.js');

describe('positions service', () => {
  beforeEach(() => {
    invalidatePositionsSnapshotCache();
    mockFetchEvmBalances.mockClear();
    mockFetchPrices.mockClear();
  });

  it('marks snapshot as stale when prices are missing instead of forcing zero prices as valid', async () => {
    const snapshot = await getPositionsSnapshot({ force: true });
    expect(snapshot.isStale).toBe(true);
    expect(snapshot.missingSymbols).toContain('ETH');
    expect(snapshot.prices.ETH).toBeUndefined();
    expect(snapshot.positions[0].totalUsdValue).toBe(0);
  });

  it('deduplicates concurrent refreshes', async () => {
    const [first, second] = await Promise.all([
      getPositionsSnapshot({ force: true }),
      getPositionsSnapshot({ force: true }),
    ]);

    expect(first.timestamp).toBe(second.timestamp);
    expect(mockFetchEvmBalances).toHaveBeenCalledTimes(1);
  });
});
