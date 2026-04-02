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
