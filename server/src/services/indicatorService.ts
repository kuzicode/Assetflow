interface KlineRow {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  closeTime: number;
}

interface MaPoint {
  time: string;
  close: number;
  ma2: number;
  ma3: number;
  ma4: number;
  ma5: number;
  ma6: number;
  macd: number;
  signal: number;
  hist: number;
}

interface IndicatorCache<T> {
  value: T | null;
  expiresAt: number;
}

const BINANCE_KLINES_URLS = [
  'https://api1.binance.com/api/v3/klines',
  'https://api2.binance.com/api/v3/klines',
  'https://api3.binance.com/api/v3/klines',
  'https://api4.binance.com/api/v3/klines',
];

const DEFAULT_TREND_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'UNI', 'AAVE'];

const maChartCache = new Map<string, IndicatorCache<any>>();
const maTrendsCache = new Map<string, IndicatorCache<any>>();

function getNowIso() {
  return new Date().toISOString();
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function ensureSymbol(symbol: string) {
  const normalized = symbol.toUpperCase().trim();
  return normalized.endsWith('USDT') ? normalized : `${normalized}USDT`;
}

function ensureInterval(interval: string) {
  return ['1h', '4h', '1d'].includes(interval) ? interval : '4h';
}

function toChartTime(timestamp: number) {
  return new Date(timestamp).toISOString();
}

function rollingMean(values: number[], window: number) {
  const result: number[] = [];
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= window) sum -= values[index - window];
    result.push(index >= window - 1 ? sum / window : Number.NaN);
  }
  return result;
}

function ema(values: number[], span: number) {
  const alpha = 2 / (span + 1);
  const result: number[] = [];
  let prev = values[0] ?? 0;
  for (let index = 0; index < values.length; index += 1) {
    const current = values[index];
    prev = index === 0 ? current : alpha * current + (1 - alpha) * prev;
    result.push(prev);
  }
  return result;
}

async function fetchJsonWithFallback(urls: string[], init?: RequestInit) {
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown fetch error');
    }
  }
  throw lastError || new Error('All fetch attempts failed');
}

const INTERVAL_MS: Record<string, number> = { '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };

function parseKlineRows(rows: any[]): KlineRow[] {
  return rows.map((row) => ({
    openTime: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    closeTime: Number(row[6]),
  }));
}

async function fetchBinanceKlines(symbol: string, interval: string, totalCandles: number): Promise<KlineRow[]> {
  const sym = ensureSymbol(symbol);
  const ivl = ensureInterval(interval);
  const intervalMs = INTERVAL_MS[ivl] ?? 14_400_000;
  const batchSize = 1000;

  const all: KlineRow[] = [];
  let startTime = Date.now() - totalCandles * intervalMs;

  while (all.length < totalCandles) {
    const limit = Math.min(batchSize, totalCandles - all.length);
    const query = `symbol=${sym}&interval=${ivl}&startTime=${startTime}&limit=${limit}`;
    const rows = await fetchJsonWithFallback(BINANCE_KLINES_URLS.map((url) => `${url}?${query}`)) as any[];
    if (!Array.isArray(rows) || rows.length === 0) break;
    const parsed = parseKlineRows(rows);
    all.push(...parsed);
    if (rows.length < limit) break;
    startTime = parsed[parsed.length - 1].openTime + intervalMs;
  }

  return all;
}

function buildMaSeries(klines: KlineRow[]): MaPoint[] {
  const closes = klines.map((item) => item.close);
  const highs = klines.map((item) => item.high);
  const lows = klines.map((item) => item.low);
  const ma30 = rollingMean(closes, 30);
  const ma72 = rollingMean(closes, 72);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macd = ema12.map((value, index) => value - ema26[index]);
  const signal = ema(macd, 9);

  const points: MaPoint[] = [];
  for (let index = 0; index < klines.length; index += 1) {
    const base = (ma30[index] + ma72[index]) / 2;
    if (!Number.isFinite(base)) continue;
    const currentMacd = macd[index];
    const currentSignal = signal[index];
    points.push({
      time: toChartTime(klines[index].openTime),
      close: closes[index],
      ma2: base,
      ma3: base * 1.1,
      ma4: base * 1.2,
      ma5: base * 0.9,
      ma6: base * 0.8,
      macd: currentMacd,
      signal: currentSignal,
      hist: currentMacd - currentSignal,
    });
  }

  // keep support/resistance source series aligned with point count
  const offset = klines.length - points.length;
  for (let index = 0; index < points.length; index += 1) {
    (points[index] as MaPoint & { high?: number; low?: number }).high = highs[index + offset];
    (points[index] as MaPoint & { low?: number }).low = lows[index + offset];
  }

  return points;
}

function classifyTrend(point: MaPoint) {
  if (point.close > point.ma4) return 'above_ma4';
  if (point.close > point.ma3) return 'above_ma3';
  if (point.close > point.ma2) return 'between_ma2_ma3';
  if (point.close > point.ma5) return 'between_ma5_ma2';
  if (point.close > point.ma6) return 'below_ma5';
  return 'below_ma6';
}

function buildTradingAdvice(points: MaPoint[]) {
  const latest = points[points.length - 1];
  const prev = points[Math.max(0, points.length - 2)];
  const prev5 = points[Math.max(0, points.length - 5)];
  const recent = points.slice(-50) as Array<MaPoint & { high?: number; low?: number }>;
  const support = Math.min(...recent.map((point) => point.low ?? point.close));
  const resistance = Math.max(...recent.map((point) => point.high ?? point.close));
  const priceVolatility = ((latest.close - support) / Math.max(latest.close, 1)) * 100;

  let trend = '横盘整理';
  if (latest.close > latest.ma2) trend = latest.close > latest.ma3 ? '强势上升' : '上升';
  if (latest.close < latest.ma2) trend = latest.close < latest.ma5 ? '强势下降' : '下降';

  let signalType = '死叉';
  if (latest.macd > latest.signal) signalType = latest.hist > prev.hist ? '金叉后动能增强' : '金叉';
  else signalType = latest.hist < prev.hist ? '死叉后动能增强' : '死叉';

  return {
    trend,
    signalType,
    support: round(support, 2),
    resistance: round(resistance, 2),
    riskLevel: priceVolatility > 5 ? '高' : priceVolatility > 2 ? '中' : '低',
    momentum: round(((latest.close - prev5.close) / prev5.close) * 100, 2),
  };
}

export async function getMaChart(symbol: string, interval: string) {
  const normalizedSymbol = ensureSymbol(symbol);
  const normalizedInterval = ensureInterval(interval);
  const cacheKey = `${normalizedSymbol}:${normalizedInterval}`;
  const cached = maChartCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  // 2 years at 4h = 4380 candles; at 1h = 17520; at 1d = 730
  const candlesPerYear: Record<string, number> = { '1h': 8760, '4h': 2190, '1d': 365 };
  const totalCandles = (candlesPerYear[normalizedInterval] ?? 2190) * 2;
  const klines = await fetchBinanceKlines(normalizedSymbol, normalizedInterval, totalCandles);
  if (klines.length === 0) {
    throw new Error('无法获取 MA 指标数据');
  }

  const points = buildMaSeries(klines);
  const latest = points[points.length - 1];
  const analysis = buildTradingAdvice(points);

  const result = {
    symbol: normalizedSymbol.replace('USDT', ''),
    interval: normalizedInterval,
    chartData: points,
    marketInfo: {
      price: round(latest.close, 4),
      ma2: round(latest.ma2, 4),
      ma3: round(latest.ma3, 4),
      ma4: round(latest.ma4, 4),
      ma5: round(latest.ma5, 4),
      ma6: round(latest.ma6, 4),
    },
    analysis,
    timestamp: getNowIso(),
  };

  maChartCache.set(cacheKey, { value: result, expiresAt: Date.now() + 5 * 60 * 1000 });
  return result;
}

export async function getMaTrends(interval: string, symbols = DEFAULT_TREND_SYMBOLS) {
  const normalizedInterval = ensureInterval(interval);
  const normalizedSymbols = symbols.map((symbol) => symbol.toUpperCase().trim()).filter(Boolean);
  const cacheKey = `${normalizedInterval}:${normalizedSymbols.join(',')}`;
  const cached = maTrendsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const groups: Record<string, string[]> = {
    above_ma4: [],
    above_ma3: [],
    between_ma2_ma3: [],
    between_ma5_ma2: [],
    below_ma5: [],
    below_ma6: [],
  };

  await Promise.all(normalizedSymbols.map(async (symbol) => {
    try {
      const chart = await getMaChart(symbol, normalizedInterval);
      const point = chart.chartData[chart.chartData.length - 1];
      groups[classifyTrend(point)].push(symbol);
    } catch {
      // ignore per-symbol errors so the whole board can still render
    }
  }));

  const result = {
    interval: normalizedInterval,
    symbols: normalizedSymbols,
    trends: groups,
    timestamp: getNowIso(),
  };
  maTrendsCache.set(cacheKey, { value: result, expiresAt: Date.now() + 10 * 60 * 1000 });
  return result;
}

export { classifyTrend, buildMaSeries };

// ────────────────────────────────────────────────────────────
// MVRV
// ────────────────────────────────────────────────────────────


export interface MvrvHistoryItem {
  date: string;
  mvrv: number;
  price: number;
}

export interface MvrvResult {
  current: {
    mvrv: number;
    price: number;
    status: string;
    percentile: number;
  };
  history: MvrvHistoryItem[];
  timestamp: string;
}

// In-memory cache that also holds stale data for fallback
let mvrvCache: { value: MvrvResult | null; expiresAt: number } = { value: null, expiresAt: 0 };

const BITCOIN_DATA_BASE = 'https://bitcoin-data.com/v1';

interface BitcoinDataPoint {
  t: string; // "YYYY-MM-DD"
  v: number;
}

function getMvrvStatus(mvrv: number): string {
  if (mvrv < 1.0) return '低估区';
  if (mvrv <= 3.0) return '合理区';
  return '高估区';
}

function computePercentile(values: number[], current: number): number {
  const below = values.filter((v) => v <= current).length;
  return Math.round((below / values.length) * 100);
}

async function fetchBitcoinData<T>(path: string): Promise<T> {
  const resp = await fetch(`${BITCOIN_DATA_BASE}/${path}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`bitcoin-data.com/${path} HTTP ${resp.status}`);
  return resp.json() as Promise<T>;
}

export async function getMvrv(): Promise<MvrvResult> {
  // Return fresh cache
  if (mvrvCache.value && mvrvCache.expiresAt > Date.now()) return mvrvCache.value;

  try {
    const [mvrvRaw, priceRaw] = await Promise.all([
      fetchBitcoinData<BitcoinDataPoint[]>('mvrv'),
      fetchBitcoinData<BitcoinDataPoint[]>('btc-price'),
    ]);

    const priceMap = new Map<string, number>();
    for (const item of priceRaw) priceMap.set(item.t, item.v);

    const history: MvrvHistoryItem[] = mvrvRaw
      .filter((item) => priceMap.has(item.t))
      .map((item) => ({ date: item.t, mvrv: item.v, price: priceMap.get(item.t)! }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (history.length === 0) throw new Error('MVRV history is empty after merge');

    const latest = history[history.length - 1];
    const percentile = computePercentile(history.map((h) => h.mvrv), latest.mvrv);

    const result: MvrvResult = {
      current: {
        mvrv: round(latest.mvrv, 3),
        price: round(latest.price, 0),
        status: getMvrvStatus(latest.mvrv),
        percentile,
      },
      history,
      timestamp: getNowIso(),
    };

    // 24h cache — 8 req/hour limit on free tier, production only calls once/day
    mvrvCache = { value: result, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    return result;
  } catch (err) {
    // On rate-limit or network error: return stale cache if available
    if (mvrvCache.value) {
      console.warn('[MVRV] fetch failed, serving stale cache:', err instanceof Error ? err.message : err);
      return mvrvCache.value;
    }
    throw err;
  }
}

// ────────────────────────────────────────────────────────────
// AHR999
// ────────────────────────────────────────────────────────────

export interface Ahr999HistoryItem {
  date: string;
  ahr999: number;
  price: number;
  cost200d: number;
  fittedPrice: number;
}

export interface Ahr999Result {
  current: {
    ahr999: number;
    price: number;
    cost200d: number;
    fittedPrice: number;
    suggestion: string;
  };
  history: Ahr999HistoryItem[];
  timestamp: string;
}

let ahr999Cache: IndicatorCache<Ahr999Result> = { value: null, expiresAt: 0 };

const GENESIS_TIME = new Date('2009-01-03').getTime();

function getAhr999Suggestion(ahr999: number): string {
  if (ahr999 < 0.45) return '抄底区';
  if (ahr999 <= 1.2) return '定投区';
  return '观望区';
}

export async function getAhr999(): Promise<Ahr999Result> {
  if (ahr999Cache.value && ahr999Cache.expiresAt > Date.now()) return ahr999Cache.value;

  try {
    const klines = await fetchBinanceKlines('BTC', '1d', 1825);
    if (klines.length === 0) throw new Error('无法获取 BTC K 线数据');

    const closes = klines.map((k) => k.close);
    const ma200 = rollingMean(closes, 200);

    const history: Ahr999HistoryItem[] = [];

    for (let i = 0; i < klines.length; i += 1) {
      if (!Number.isFinite(ma200[i])) continue;

      const kline = klines[i];
      const price = kline.close;
      const cost200d = ma200[i];
      const daysSinceGenesis = (kline.openTime - GENESIS_TIME) / 86_400_000;
      const fittedPrice = Math.pow(10, 5.84 * Math.log10(daysSinceGenesis) - 17.3);
      const ahr999 = (price / cost200d) * (price / fittedPrice);

      history.push({
        date: new Date(kline.openTime).toISOString().slice(0, 10),
        ahr999: round(ahr999, 4),
        price: round(price, 2),
        cost200d: round(cost200d, 2),
        fittedPrice: round(fittedPrice, 2),
      });
    }

    if (history.length === 0) throw new Error('AHR999 history is empty after computation');

    const latest = history[history.length - 1];

    const result: Ahr999Result = {
      current: {
        ahr999: latest.ahr999,
        price: latest.price,
        cost200d: latest.cost200d,
        fittedPrice: latest.fittedPrice,
        suggestion: getAhr999Suggestion(latest.ahr999),
      },
      history,
      timestamp: getNowIso(),
    };

    ahr999Cache = { value: result, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    return result;
  } catch (err) {
    if (ahr999Cache.value) {
      console.warn('[AHR999] fetch failed, serving stale cache:', err instanceof Error ? err.message : err);
      return ahr999Cache.value;
    }
    throw err;
  }
}

// ────────────────────────────────────────────────────────────
// BTCDOM
// ────────────────────────────────────────────────────────────

export interface BtcdomHistoryItem {
  date: string;
  dominance: number;
}

export interface BtcdomResult {
  current: {
    dominance: number;
    price: number;
    status: string;
  };
  history: BtcdomHistoryItem[];
  timestamp: string;
}

let btcdomCache: IndicatorCache<BtcdomResult> = { value: null, expiresAt: 0 };

const COINGECKO_BASE = 'https://pro-api.coingecko.com/api/v3';

function getBtcdomStatus(dominance: number): string {
  if (dominance > 60) return 'BTC主导';
  if (dominance >= 40) return '均衡';
  return '山寨季';
}

async function fetchCoinGecko<T>(path: string): Promise<T> {
  const apiKey = process.env.COINGECKO_API_KEY ?? '';
  const resp = await fetch(`${COINGECKO_BASE}${path}`, {
    headers: {
      'Accept': 'application/json',
      'x-cg-pro-api-key': apiKey,
    },
  });
  if (!resp.ok) throw new Error(`CoinGecko ${path} HTTP ${resp.status}`);
  return resp.json() as Promise<T>;
}

export async function getBtcdom(): Promise<BtcdomResult> {
  if (btcdomCache.value && btcdomCache.expiresAt > Date.now()) return btcdomCache.value;

  try {
    const [globalData, btcChart, globalChart] = await Promise.all([
      fetchCoinGecko<{ data: { market_cap_percentage: { btc: number } } }>('/global'),
      fetchCoinGecko<{ market_caps: [number, number][]; prices: [number, number][] }>(
        '/coins/bitcoin/market_chart?vs_currency=usd&days=1095&interval=daily',
      ),
      fetchCoinGecko<{ market_cap: [number, number][] }>(
        '/global/market_cap_chart?days=1095&vs_currency=usd',
      ),
    ]);

    // Build BTC mcap and price by date
    const btcMcapByDate = new Map<string, number>();
    const btcPriceByDate = new Map<string, number>();

    for (const [ts, mcap] of btcChart.market_caps) {
      const date = new Date(ts).toISOString().slice(0, 10);
      btcMcapByDate.set(date, mcap);
    }
    for (const [ts, price] of btcChart.prices) {
      const date = new Date(ts).toISOString().slice(0, 10);
      btcPriceByDate.set(date, price);
    }

    // Build total mcap by date
    const totalMcapByDate = new Map<string, number>();
    for (const [ts, totalMcap] of globalChart.market_cap) {
      const date = new Date(ts).toISOString().slice(0, 10);
      totalMcapByDate.set(date, totalMcap);
    }

    // Align by date
    const history: BtcdomHistoryItem[] = [];
    for (const [date, btcMcap] of btcMcapByDate) {
      const totalMcap = totalMcapByDate.get(date);
      if (totalMcap == null || totalMcap === 0) continue;
      const dominance = round((btcMcap / totalMcap) * 100, 2);
      history.push({ date, dominance });
    }
    history.sort((a, b) => a.date.localeCompare(b.date));

    if (history.length === 0) throw new Error('BTCDOM history is empty after merge');

    const currentDominance = round(globalData.data.market_cap_percentage.btc, 2);

    // Get current price from last btcChart prices entry
    const lastPriceEntry = btcChart.prices[btcChart.prices.length - 1];
    const currentPrice = lastPriceEntry ? round(lastPriceEntry[1], 0) : 0;

    const result: BtcdomResult = {
      current: {
        dominance: currentDominance,
        price: currentPrice,
        status: getBtcdomStatus(currentDominance),
      },
      history,
      timestamp: getNowIso(),
    };

    btcdomCache = { value: result, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    return result;
  } catch (err) {
    if (btcdomCache.value) {
      console.warn('[BTCDOM] fetch failed, serving stale cache:', err instanceof Error ? err.message : err);
      return btcdomCache.value;
    }
    throw err;
  }
}
