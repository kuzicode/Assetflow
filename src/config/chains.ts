export const SUPPORTED_CHAINS = [
  { id: 'ethereum', name: 'Ethereum', nativeSymbol: 'ETH' },
  { id: 'arbitrum', name: 'Arbitrum', nativeSymbol: 'ETH' },
  { id: 'optimism', name: 'Optimism', nativeSymbol: 'ETH' },
  { id: 'base', name: 'Base', nativeSymbol: 'ETH' },
  { id: 'polygon', name: 'Polygon', nativeSymbol: 'POL' },
  { id: 'bsc', name: 'BSC', nativeSymbol: 'BNB' },
  { id: 'avalanche', name: 'Avalanche', nativeSymbol: 'AVAX' },
] as const;

export const BASE_TOKENS = ['STABLE', 'ETH', 'BTC', 'BNB'] as const;

// 稳定币 symbols 归入 STABLE 分组
export const STABLECOIN_SYMBOLS = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'LUSD', 'crvUSD'] as const;

export const TOKEN_DISPLAY_NAMES: Record<string, string> = {
  STABLE: '稳定币',
  ETH: 'ETH',
  BTC: 'BTC',
  BNB: 'BNB',
};

export type ChainId = (typeof SUPPORTED_CHAINS)[number]['id'];
export type BaseToken = (typeof BASE_TOKENS)[number];

export const API_BASE = import.meta.env.VITE_API_BASE || '';
