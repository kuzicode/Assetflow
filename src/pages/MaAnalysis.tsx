import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineStyle, LineSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { apiFetch } from '../lib/api';
import { useStore } from '../store/useStore';
import type { MaChartResponse, MaTrendsResponse } from '../types';

const FAVORITES = ['BTC', 'ETH', 'SOL', 'BNB'] as const;


const TREND_LABELS: Record<string, string> = {
  above_ma4: '突破强势线',
  above_ma3: '突破上涨线',
  between_ma2_ma3: '盘整区上行',
  between_ma5_ma2: '盘整区下行',
  below_ma5: '跌破下跌线',
  below_ma6: '跌破超跌线',
};

const TREND_ORDER = [
  'above_ma4',
  'above_ma3',
  'between_ma2_ma3',
  'between_ma5_ma2',
  'below_ma5',
  'below_ma6',
] as const;

const ANALYSIS_ROW_STYLES = {
  price: 'text-slate-500',
  ma4: 'text-emerald-700',
  ma3: 'text-emerald-500',
  ma2: 'text-slate-600',
  ma5: 'text-rose-400',
  ma6: 'text-rose-600',
} as const;

const TREND_TONE_STYLES: Record<string, { labelClass: string; countClass: string; chipClass: string }> = {
  above_ma4: { labelClass: 'text-emerald-700', countClass: 'text-emerald-700', chipClass: 'bg-emerald-100 text-emerald-700' },
  above_ma3: { labelClass: 'text-emerald-500', countClass: 'text-emerald-500', chipClass: 'bg-emerald-50 text-emerald-600' },
  between_ma2_ma3: { labelClass: 'text-amber-600', countClass: 'text-amber-600', chipClass: 'bg-amber-50 text-amber-700' },
  between_ma5_ma2: { labelClass: 'text-orange-500', countClass: 'text-orange-500', chipClass: 'bg-orange-50 text-orange-600' },
  below_ma5: { labelClass: 'text-rose-500', countClass: 'text-rose-500', chipClass: 'bg-rose-50 text-rose-600' },
  below_ma6: { labelClass: 'text-rose-700', countClass: 'text-rose-700', chipClass: 'bg-rose-100 text-rose-700' },
};

function toUTC(isoString: string): UTCTimestamp {
  return Math.floor(new Date(isoString).getTime() / 1000) as UTCTimestamp;
}

function getTrendTextClass(trend: string) {
  if (trend.includes('强势上升')) return 'text-emerald-700';
  if (trend.includes('上升')) return 'text-emerald-500';
  if (trend.includes('强势下降')) return 'text-rose-700';
  if (trend.includes('下降')) return 'text-rose-500';
  return 'text-slate-600';
}

function getSignalTextClass(signal: string) {
  if (signal.includes('金叉')) return 'text-emerald-600';
  if (signal.includes('死叉')) return 'text-rose-600';
  return 'text-slate-600';
}

function formatPrice(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: value >= 1 ? 2 : 4 });
}

const CHART_BASE_OPTIONS = {
  layout: {
    background: { type: ColorType.Solid, color: '#f7fbf9' },
    textColor: '#6d7a77',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 12,
  },
  grid: {
    vertLines: { color: 'rgba(109,122,119,0.12)' },
    horzLines: { color: 'rgba(109,122,119,0.12)' },
  },
  crosshair: { mode: 1 },
  rightPriceScale: { borderColor: 'rgba(109,122,119,0.25)' },
  timeScale: { borderColor: 'rgba(109,122,119,0.25)', timeVisible: true, secondsVisible: false },
  handleScroll: true,
  handleScale: true,
} as const;

export default function MaAnalysis() {
  const { maChartCache, maTrendsCache, setMaChartCache, setMaTrendsCache } = useStore();
  const [symbol, setSymbol] = useState('BTC');
  const interval = '4h';
  const [chart, setChart] = useState<MaChartResponse | null>(null);
  const [trends, setTrends] = useState<MaTrendsResponse | null>(maTrendsCache);
  const [loadingChart, setLoadingChart] = useState(false);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);
  const maChartRef = useRef<IChartApi | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);

  // MA price series refs
  const closeSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const ma2Series = useRef<ISeriesApi<'Line'> | null>(null);
  const ma3Series = useRef<ISeriesApi<'Line'> | null>(null);
  const ma4Series = useRef<ISeriesApi<'Line'> | null>(null);
  const ma5Series = useRef<ISeriesApi<'Line'> | null>(null);
  const ma6Series = useRef<ISeriesApi<'Line'> | null>(null);

  // MACD series refs
  const histSeries = useRef<ISeriesApi<'Histogram'> | null>(null);
  const macdSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const signalSeries = useRef<ISeriesApi<'Line'> | null>(null);

  // Initialize charts once on mount
  useEffect(() => {
    if (!maContainerRef.current || !macdContainerRef.current) return;

    const maChart = createChart(maContainerRef.current, {
      ...CHART_BASE_OPTIONS,
      width: maContainerRef.current.clientWidth,
      height: maContainerRef.current.clientHeight,
    });

    const macdChart = createChart(macdContainerRef.current, {
      ...CHART_BASE_OPTIONS,
      width: macdContainerRef.current.clientWidth,
      height: macdContainerRef.current.clientHeight,
    });

    // Synchronize time axes
    maChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) macdChart.timeScale().setVisibleLogicalRange(range);
    });
    macdChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) maChart.timeScale().setVisibleLogicalRange(range);
    });

    closeSeries.current = maChart.addSeries(LineSeries, { color: '#191c1d', lineWidth: 2, priceLineVisible: true, lastValueVisible: true, title: '价格' });
    ma2Series.current = maChart.addSeries(LineSeries, { color: '#6d7a77', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, title: 'MA2' });
    ma3Series.current = maChart.addSeries(LineSeries, { color: '#34c38f', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, title: 'MA3' });
    ma4Series.current = maChart.addSeries(LineSeries, { color: '#00855d', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, title: 'MA4' });
    ma5Series.current = maChart.addSeries(LineSeries, { color: '#e07a5f', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, title: 'MA5' });
    ma6Series.current = maChart.addSeries(LineSeries, { color: '#ba1a1a', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, title: 'MA6' });

    histSeries.current = macdChart.addSeries(HistogramSeries, { color: '#34c38f', priceLineVisible: false, lastValueVisible: false });
    macdSeries.current = macdChart.addSeries(LineSeries, { color: '#4f8ef7', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: 'MACD' });
    signalSeries.current = macdChart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: 'Signal' });

    maChartRef.current = maChart;
    macdChartRef.current = macdChart;

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (maContainerRef.current) maChart.resize(maContainerRef.current.clientWidth, maContainerRef.current.clientHeight);
      if (macdContainerRef.current) macdChart.resize(macdContainerRef.current.clientWidth, macdContainerRef.current.clientHeight);
    });
    if (maContainerRef.current) resizeObserver.observe(maContainerRef.current);
    if (macdContainerRef.current) resizeObserver.observe(macdContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      maChart.remove();
      macdChart.remove();
      maChartRef.current = null;
      macdChartRef.current = null;
    };
  }, []);

  // Update series data when chart response changes
  useEffect(() => {
    if (!chart || !closeSeries.current) return;
    const pts = chart.chartData;
    closeSeries.current.setData(pts.map((p) => ({ time: toUTC(p.time), value: p.close })));
    ma2Series.current?.setData(pts.map((p) => ({ time: toUTC(p.time), value: p.ma2 })));
    ma3Series.current?.setData(pts.map((p) => ({ time: toUTC(p.time), value: p.ma3 })));
    ma4Series.current?.setData(pts.map((p) => ({ time: toUTC(p.time), value: p.ma4 })));
    ma5Series.current?.setData(pts.map((p) => ({ time: toUTC(p.time), value: p.ma5 })));
    ma6Series.current?.setData(pts.map((p) => ({ time: toUTC(p.time), value: p.ma6 })));
    histSeries.current?.setData(pts.map((p) => ({
      time: toUTC(p.time),
      value: p.hist,
      color: p.hist >= 0 ? '#34c38f' : '#e07a5f',
    })));
    macdSeries.current?.setData(pts.map((p) => ({ time: toUTC(p.time), value: p.macd })));
    signalSeries.current?.setData(pts.map((p) => ({ time: toUTC(p.time), value: p.signal })));
    // Default view: last 6 months, but full 2 years is available via zoom/scroll
    const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
    const sixMonthsAgo = (now - 180 * 24 * 3600) as UTCTimestamp;
    const range = { from: sixMonthsAgo, to: now };
    maChartRef.current?.timeScale().setVisibleRange(range);
    macdChartRef.current?.timeScale().setVisibleRange(range);
  }, [chart]);

  const loadChart = async (nextSymbol = symbol, nextInterval = interval) => {
    const cacheKey = `${nextSymbol}-${nextInterval}`;
    const cached = maChartCache[cacheKey];
    if (cached) {
      setChart(cached);
      return;
    }
    setLoadingChart(true);
    setError(null);
    try {
      const data = await apiFetch('/api/indicators/ma/chart', {
        method: 'POST',
        body: JSON.stringify({ symbol: nextSymbol, interval: nextInterval }),
      });
      setChart(data);
      setMaChartCache(cacheKey, data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'MA 指标加载失败');
    } finally {
      setLoadingChart(false);
    }
  };

  const loadTrends = async (nextInterval = interval) => {
    if (maTrendsCache) {
      setTrends(maTrendsCache);
      return;
    }
    setLoadingTrends(true);
    try {
      const data = await apiFetch('/api/indicators/ma/trends', {
        method: 'POST',
        body: JSON.stringify({ interval: nextInterval, symbols: FAVORITES }),
      });
      setTrends(data);
      setMaTrendsCache(data);
    } catch {
      setTrends(null);
    } finally {
      setLoadingTrends(false);
    }
  };

  // Sync store cache into local state when it arrives after mount
  useEffect(() => {
    const cacheKey = `${symbol}-${interval}`;
    if (!chart && maChartCache[cacheKey]) setChart(maChartCache[cacheKey]);
  }, [maChartCache]);

  useEffect(() => {
    if (!trends && maTrendsCache) setTrends(maTrendsCache);
  }, [maTrendsCache]);

  useEffect(() => {
    loadChart();
    loadTrends();
  }, []);

  const handleFavoriteClick = (nextSymbol: string) => {
    setSymbol(nextSymbol);
    void loadChart(nextSymbol, interval);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && symbol.trim()) {
      void loadChart(symbol.trim(), interval);
    }
  };

  return (
    <div className="space-y-6">
      {/* Favorites Bar */}
      <section className="rounded-[2rem] bg-surface-container-lowest p-3 shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-on-surface-variant px-1.5">快捷查询：</span>
          {FAVORITES.map((favorite) => (
            <button
              key={favorite}
              type="button"
              onClick={() => handleFavoriteClick(favorite)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                symbol === favorite
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-primary-fixed/35 hover:text-primary'
              }`}
            >
              {favorite}
            </button>
          ))}
        </div>
      </section>

      {/* Main Layout: Chart Area + Right Panel */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Chart Area */}
        <div className="space-y-3">
          <div className="rounded-[2rem] bg-surface-container-lowest shadow-[0px_12px_32px_rgba(25,28,29,0.04)] overflow-hidden">
            {/* MA Chart */}
            <div className="relative h-[620px] xl:h-[700px]">
              {loadingChart && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-container-lowest/80 rounded-[2rem]">
                  <span className="text-sm text-on-surface-variant">加载图表中...</span>
                </div>
              )}
              <div ref={maContainerRef} className="w-full h-full" />
            </div>
            {/* Divider */}
            <div className="mx-4 h-px bg-outline-variant/20" />
            {/* MACD Chart */}
            <div className="relative h-[200px] xl:h-[230px]">
              {loadingChart && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-container-lowest/80">
                  <span className="text-sm text-on-surface-variant">加载 MACD 中...</span>
                </div>
              )}
              <div ref={macdContainerRef} className="w-full h-full" />
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-[2rem] bg-surface-container-lowest p-4 shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-headline text-lg font-bold text-primary">控制面板</h3>
              <button
                type="button"
                onClick={() => void Promise.all([loadChart(), loadTrends()])}
                className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-on-primary hover:opacity-90"
              >
                刷新
              </button>
            </div>

            <div className="space-y-3">
              {/* Search */}
              <div className="rounded-[1.35rem] border border-outline-variant/50 bg-surface p-3">
                <label className="block">
                  <span className="mb-2 block text-[11px] font-bold tracking-[0.1em] text-on-surface-variant">搜索币种</span>
                  <div className="flex gap-2">
                    <input
                      value={symbol}
                      onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                      onKeyDown={handleSearchKeyDown}
                      className="min-w-0 flex-1 rounded-xl border border-outline-variant bg-white px-3 py-2 text-sm font-semibold outline-none transition-colors focus:border-primary"
                      placeholder="BTC"
                    />
                    <button
                      type="button"
                      onClick={() => void loadChart(symbol.trim(), interval)}
                      className="shrink-0 rounded-xl bg-primary-fixed px-3 py-2 text-xs font-bold text-primary hover:bg-primary-fixed-dim"
                    >
                      查询
                    </button>
                  </div>
                </label>
              </div>

              {/* Coin Analysis */}
              {chart && (
                <div className="rounded-[1.35rem] border border-outline-variant/50 bg-surface p-3">
                  <h4 className="mb-2 text-[13px] font-bold text-slate-900">
                    {chart.symbol} 币种分析
                  </h4>
                  <dl className="space-y-1.5 text-[12px] leading-5">
                    <div className="flex items-center justify-between gap-3">
                      <dt className={ANALYSIS_ROW_STYLES.price}>当前价格</dt>
                      <dd className="font-mono-data font-bold text-slate-900">{formatPrice(chart.marketInfo.price)} USDT</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className={ANALYSIS_ROW_STYLES.ma4}>强势线(MA4)</dt>
                      <dd className="font-mono-data font-bold text-emerald-700">{formatPrice(chart.marketInfo.ma4)} USDT</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className={ANALYSIS_ROW_STYLES.ma3}>上涨线(MA3)</dt>
                      <dd className="font-mono-data font-bold text-emerald-500">{formatPrice(chart.marketInfo.ma3)} USDT</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className={ANALYSIS_ROW_STYLES.ma2}>趋势线(MA2)</dt>
                      <dd className="font-mono-data font-bold text-slate-700">{formatPrice(chart.marketInfo.ma2)} USDT</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className={ANALYSIS_ROW_STYLES.ma5}>下跌线(MA5)</dt>
                      <dd className="font-mono-data font-bold text-rose-400">{formatPrice(chart.marketInfo.ma5)} USDT</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className={ANALYSIS_ROW_STYLES.ma6}>超跌线(MA6)</dt>
                      <dd className="font-mono-data font-bold text-rose-600">{formatPrice(chart.marketInfo.ma6)} USDT</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-outline-variant/30">
                      <dt className="text-slate-500">市场趋势</dt>
                      <dd className={`font-semibold ${getTrendTextClass(chart.analysis.trend)}`}>{chart.analysis.trend}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500">MACD信号</dt>
                      <dd className={`font-semibold ${getSignalTextClass(chart.analysis.signalType)}`}>{chart.analysis.signalType}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Trends Board */}
              <div className="rounded-[1.35rem] border border-outline-variant/50 bg-surface p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-[13px] font-bold text-slate-900">主流币盘面趋势</h4>
                  <button
                    type="button"
                    onClick={() => void loadTrends()}
                    className="rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-bold text-on-surface-variant hover:bg-surface-container-high"
                  >
                    {loadingTrends ? '刷新中' : '刷新'}
                  </button>
                </div>

                <div className="space-y-1 text-[12px]">
                  {TREND_ORDER.map((key) => {
                    const items = trends?.trends[key] || [];
                    const tone = TREND_TONE_STYLES[key];
                    return (
                      <div key={key} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 py-0.5">
                        <span className={`shrink-0 font-bold ${tone.labelClass}`}>
                          {TREND_LABELS[key]} ({items.length}):
                        </span>
                        {items.length > 0 ? (
                          items.map((item) => (
                            <span key={item} className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tone.chipClass}`}>
                              {item}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400">无</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className={`px-1 text-center text-[11px] font-medium ${error ? 'text-rose-500' : 'text-slate-400'}`}>
                {error ? error : loadingChart ? '图表刷新中...' : chart ? `${chart.symbol} · ${chart.timestamp.slice(0, 10)} 更新` : '等待查询'}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
