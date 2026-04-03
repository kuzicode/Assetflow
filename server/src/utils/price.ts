import { STABLECOIN_SYMBOLS } from '../config/chains.js';

export interface PriceSnapshot {
  prices: Record<string, number>;
  ath: Record<string, { ath: number; athDate: string }>;
  missingSymbols: string[];
  partialFailureSources: string[];
  timestamp: string;
}

// --- ATH via CoinGecko ---

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const COINGECKO_ID_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
};

interface AthEntry { ath: number; athDate: string }

const athCache: { data: Record<string, AthEntry> | null; expiresAt: number; stale: Record<string, AthEntry> | null } = {
  data: null, expiresAt: 0, stale: null,
};

export async function fetchAthData(symbols: string[]): Promise<Record<string, AthEntry>> {
  if (athCache.data && athCache.expiresAt > Date.now()) return athCache.data;

  const ids = symbols.map((s) => COINGECKO_ID_MAP[s]).filter(Boolean).join(',');
  if (!ids) return {};

  try {
    const apiKey = process.env.COINGECKO_API_KEY ?? '';
    const resp = await fetch(
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&per_page=10`,
      { headers: { 'Accept': 'application/json', 'x-cg-demo-api-key': apiKey }, signal: AbortSignal.timeout(10000) },
    );
    if (!resp.ok) throw new Error(`CoinGecko markets HTTP ${resp.status}`);
    const list = await resp.json() as Array<{ id: string; ath: number; ath_date: string }>;

    const result: Record<string, AthEntry> = {};
    for (const item of list) {
      const sym = Object.entries(COINGECKO_ID_MAP).find(([, id]) => id === item.id)?.[0];
      if (sym) result[sym] = { ath: item.ath, athDate: item.ath_date };
    }
    athCache.data = result;
    athCache.stale = result;
    athCache.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    return result;
  } catch (e: any) {
    console.error('[Price] ATH fetch failed:', e.message);
    return athCache.stale ?? {};
  }
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

const BINANCE_BASE_URLS = [
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api4.binance.com',
];

async function fetchBinancePrices(pairs: string[]): Promise<Record<string, number>> {
  const symbolsParam = JSON.stringify(pairs.map((p) => `${p}USDT`));
  const query = `symbols=${encodeURIComponent(symbolsParam)}`;

  let lastError: Error | null = null;
  for (const base of BINANCE_BASE_URLS) {
    try {
      const response = await fetch(`${base}/api/v3/ticker/price?${query}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as Array<{ symbol: string; price: string }>;
      const result: Record<string, number> = {};
      for (const item of data) {
        const sym = item.symbol.replace(/USDT$/, '');
        result[sym] = parseFloat(item.price);
      }
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('fetch failed');
    }
  }
  throw lastError ?? new Error('All Binance endpoints failed');
}

/**
 * Fetch USD prices for a list of symbols.
 * Returns a map: symbol -> price in USD.
 */
export async function fetchPrices(symbols: string[]): Promise<PriceSnapshot> {
  const prices: Record<string, number> = {};
  const missingSymbols = new Set<string>();
  const partialFailureSources = new Set<string>();

  // Stablecoins = $1, resolve mapped symbols
  const toFetch = new Set<string>();
  for (const sym of symbols) {
    if (STABLECOIN_SYMBOLS.includes(sym)) {
      prices[sym] = 1.0;
      continue;
    }
    toFetch.add(SYMBOL_MAP[sym] ?? sym);
  }

  if (toFetch.size > 0) {
    try {
      const fetched = await fetchBinancePrices([...toFetch]);
      for (const sym of symbols) {
        if (prices[sym] !== undefined) continue; // already set (stablecoin)
        const mapped = SYMBOL_MAP[sym] ?? sym;
        if (fetched[mapped] !== undefined) {
          prices[sym] = fetched[mapped];
          // Also set canonical symbol so group-level lookups (e.g. prices['BTC']) work
          if (mapped !== sym && prices[mapped] === undefined) prices[mapped] = fetched[mapped];
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
  }

  return {
    prices,
    ath: {},
    missingSymbols: [...missingSymbols],
    partialFailureSources: [...partialFailureSources],
    timestamp: new Date().toISOString(),
  };
}
