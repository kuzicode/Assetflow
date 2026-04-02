import ccxt from 'ccxt';
import { STABLECOIN_SYMBOLS } from '../config/chains.js';

const binance = new ccxt.binance();

export interface PriceSnapshot {
  prices: Record<string, number>;
  missingSymbols: string[];
  partialFailureSources: string[];
  timestamp: string;
}

// Symbol normalization for Binance ticker lookup
const SYMBOL_MAP: Record<string, string> = {
  WETH: 'ETH',
  WBTC: 'BTC',
  cbBTC: 'BTC',
  tBTC: 'BTC',
  WBNB: 'BNB',
  stETH: 'ETH',
  wstETH: 'ETH',
  cbETH: 'ETH',
  rETH: 'ETH',
  POL: 'POL',
};

/**
 * Fetch USD prices for a list of symbols.
 * Returns a map: symbol -> price in USD.
 */
export async function fetchPrices(symbols: string[]): Promise<PriceSnapshot> {
  const prices: Record<string, number> = {};
  const toFetch: Set<string> = new Set();
  const missingSymbols = new Set<string>();
  const partialFailureSources = new Set<string>();

  for (const sym of symbols) {
    // Stablecoins = $1
    if (STABLECOIN_SYMBOLS.includes(sym)) {
      prices[sym] = 1.0;
      continue;
    }

    const mapped = SYMBOL_MAP[sym] || sym;
    toFetch.add(mapped);
    // Keep original symbol linked
    if (mapped !== sym) {
      prices[`__map_${sym}`] = 0; // placeholder
    }
  }

  if (toFetch.size === 0) {
    return {
      prices,
      missingSymbols: [],
      partialFailureSources: [],
      timestamp: new Date().toISOString(),
    };
  }

  // Build ticker pairs
  const pairs = [...toFetch].map((s) => `${s}/USDT`);

  try {
    const tickers = await binance.fetchTickers(pairs);

    for (const sym of symbols) {
      if (prices[sym] !== undefined && prices[sym] > 0) continue; // already set (stablecoin)
      if (STABLECOIN_SYMBOLS.includes(sym)) continue;

      const mapped = SYMBOL_MAP[sym] || sym;
      const tickerKey = `${mapped}/USDT`;

      if (tickers[tickerKey]?.last) {
        prices[sym] = tickers[tickerKey].last;
        // Also set the canonical mapped symbol so group-level lookups (e.g. prices['BTC']) work
        if (mapped !== sym && !prices[mapped]) prices[mapped] = tickers[tickerKey].last;
      } else {
        missingSymbols.add(sym);
      }
    }
  } catch (e: any) {
    console.error('[Price] Fetch tickers failed:', e.message);
    partialFailureSources.add('binance');
    for (const sym of symbols) {
      if (prices[sym] === undefined) missingSymbols.add(sym);
    }
  }

  // Clean up internal markers
  for (const key of Object.keys(prices)) {
    if (key.startsWith('__map_')) delete prices[key];
  }

  return {
    prices,
    missingSymbols: [...missingSymbols],
    partialFailureSources: [...partialFailureSources],
    timestamp: new Date().toISOString(),
  };
}
