import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineSeries, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { apiFetch } from '../lib/api';

interface Ahr999HistoryItem {
  date: string;
  ahr999: number;
  price: number;
  cost200d: number;
  fittedPrice: number;
}

interface Ahr999Response {
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

function toUTCTimestamp(dateStr: string): UTCTimestamp {
  return Math.floor(new Date(dateStr).getTime() / 1000) as UTCTimestamp;
}

function getSuggestionColors(suggestion: string) {
  if (suggestion === '抄底区') return { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
  if (suggestion === '定投区') return { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
  return { text: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' };
}

const CHART_OPTIONS = {
  layout: {
    background: { type: ColorType.Solid, color: '#f7fbf9' },
    textColor: '#6d7a77',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 12,
  },
  grid: {
    vertLines: { color: 'rgba(109,122,119,0.10)' },
    horzLines: { color: 'rgba(109,122,119,0.10)' },
  },
  crosshair: { mode: 1 },
  rightPriceScale: { borderColor: 'rgba(109,122,119,0.25)' },
  leftPriceScale: { visible: true, borderColor: 'rgba(109,122,119,0.25)' },
  timeScale: { borderColor: 'rgba(109,122,119,0.25)', timeVisible: false },
  handleScroll: true,
  handleScale: true,
} as const;

export default function Ahr999Analysis() {
  const [data, setData] = useState<Ahr999Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ahr999Visible, setAhr999Visible] = useState(true);
  const [priceVisible, setPriceVisible] = useState(true);
  const [cost200dVisible, setCost200dVisible] = useState(false);
  const [fittedVisible, setFittedVisible] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const ahr999SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const cost200dSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const fittedSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...CHART_OPTIONS,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    // AHR999 on right scale
    const ahr999Series = chart.addSeries(LineSeries, {
      color: '#00855d',
      lineWidth: 2,
      priceScaleId: 'right',
      priceLineVisible: true,
      lastValueVisible: true,
      title: 'AHR999',
      visible: true,
    });

    ahr999Series.createPriceLine({ price: 0.45, color: '#34c38f', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '0.45' });
    ahr999Series.createPriceLine({ price: 1.2, color: '#e07a5f', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '1.2' });

    // BTC price on left scale
    const priceSeries = chart.addSeries(LineSeries, {
      color: '#94a3b8',
      lineWidth: 1,
      priceScaleId: 'left',
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'BTC价格',
      visible: true,
    });

    // 200-day cost on left scale (dashed, hidden by default)
    const cost200dSeries = chart.addSeries(LineSeries, {
      color: '#8b5cf6',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceScaleId: 'left',
      priceLineVisible: false,
      lastValueVisible: true,
      title: '200日成本',
      visible: false,
    });

    // Fitted price on left scale (dashed, hidden by default)
    const fittedSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceScaleId: 'left',
      priceLineVisible: false,
      lastValueVisible: true,
      title: '拟合价格',
      visible: false,
    });

    chartRef.current = chart;
    ahr999SeriesRef.current = ahr999Series;
    priceSeriesRef.current = priceSeries;
    cost200dSeriesRef.current = cost200dSeries;
    fittedSeriesRef.current = fittedSeries;

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      ahr999SeriesRef.current = null;
      priceSeriesRef.current = null;
      cost200dSeriesRef.current = null;
      fittedSeriesRef.current = null;
    };
  }, []);

  // Update chart data
  useEffect(() => {
    if (!data || !ahr999SeriesRef.current || !priceSeriesRef.current || !cost200dSeriesRef.current || !fittedSeriesRef.current) return;

    ahr999SeriesRef.current.setData(
      data.history.map((item) => ({ time: toUTCTimestamp(item.date), value: item.ahr999 })),
    );
    priceSeriesRef.current.setData(
      data.history.map((item) => ({ time: toUTCTimestamp(item.date), value: item.price })),
    );
    cost200dSeriesRef.current.setData(
      data.history.map((item) => ({ time: toUTCTimestamp(item.date), value: item.cost200d })),
    );
    fittedSeriesRef.current.setData(
      data.history.map((item) => ({ time: toUTCTimestamp(item.date), value: item.fittedPrice })),
    );

    chartRef.current?.timeScale().fitContent();
  }, [data]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch('/api/indicators/ahr999');
      setData(result as Ahr999Response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AHR999 数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const suggestionColors = data ? getSuggestionColors(data.current.suggestion) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Cards */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* AHR999 value */}
        <div className="rounded-[2rem] bg-surface-container-lowest p-5 shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
          <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-outline">当前值</p>
          <p className={`font-mono-data text-2xl font-bold ${suggestionColors?.text ?? 'text-on-surface'}`}>
            {data ? data.current.ahr999.toFixed(4) : '—'}
          </p>
          <p className={`mt-1 text-xs font-semibold ${suggestionColors?.text ?? 'text-on-surface-variant'}`}>
            {data ? `操作建议：${data.current.suggestion}` : '—'}
          </p>
        </div>

        {/* BTC Price */}
        <div className="rounded-[2rem] bg-surface-container-lowest p-5 shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
          <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-outline">BTC 价格</p>
          <p className="font-mono-data text-2xl font-bold text-on-surface">
            {data ? `$${data.current.price.toLocaleString()}` : '—'}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">当前市价</p>
        </div>

        {/* 200-day cost */}
        <div className="rounded-[2rem] bg-surface-container-lowest p-5 shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
          <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-outline">200日定投成本</p>
          <p className="font-mono-data text-2xl font-bold text-on-surface">
            {data ? `$${data.current.cost200d.toLocaleString()}` : '—'}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">200日移动均价</p>
        </div>

        {/* Fitted price */}
        <div className="rounded-[2rem] bg-surface-container-lowest p-5 shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
          <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-outline">拟合价格</p>
          <p className="font-mono-data text-2xl font-bold text-on-surface">
            {data ? `$${data.current.fittedPrice.toLocaleString()}` : '—'}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">幂律估值模型</p>
        </div>
      </section>

      {/* Chart */}
      <section className="rounded-[2rem] bg-surface-container-lowest shadow-[0px_12px_32px_rgba(25,28,29,0.04)] overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-headline text-base font-bold text-on-surface">AHR999 历史走势</h2>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-600">&lt; 0.45 抄底区</span>
            <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-600">0.45 ~ 1.2 定投区</span>
            <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-600">&gt; 1.2 观望区</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !ahr999Visible;
                setAhr999Visible(next);
                ahr999SeriesRef.current?.applyOptions({ visible: next });
              }}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                ahr999Visible
                  ? 'border-[#00855d] bg-emerald-50 text-[#00855d]'
                  : 'border-outline-variant bg-surface-container text-on-surface-variant line-through'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${ahr999Visible ? 'bg-[#00855d]' : 'bg-outline-variant'}`} />
              AHR999
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !priceVisible;
                setPriceVisible(next);
                priceSeriesRef.current?.applyOptions({ visible: next });
              }}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                priceVisible
                  ? 'border-slate-400 bg-slate-50 text-slate-500'
                  : 'border-outline-variant bg-surface-container text-on-surface-variant line-through'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${priceVisible ? 'bg-slate-400' : 'bg-outline-variant'}`} />
              BTC价格
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !cost200dVisible;
                setCost200dVisible(next);
                cost200dSeriesRef.current?.applyOptions({ visible: next });
              }}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                cost200dVisible
                  ? 'border-violet-500 bg-violet-50 text-violet-600'
                  : 'border-outline-variant bg-surface-container text-on-surface-variant line-through'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${cost200dVisible ? 'bg-violet-500' : 'bg-outline-variant'}`} />
              200日成本
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !fittedVisible;
                setFittedVisible(next);
                fittedSeriesRef.current?.applyOptions({ visible: next });
              }}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                fittedVisible
                  ? 'border-amber-500 bg-amber-50 text-amber-600'
                  : 'border-outline-variant bg-surface-container text-on-surface-variant line-through'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${fittedVisible ? 'bg-amber-500' : 'bg-outline-variant'}`} />
              拟合价格
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-full border border-outline-variant bg-surface-container px-3 py-1.5 text-[11px] font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              {loading ? '...' : '↺ 刷新'}
            </button>
          </div>
        </div>

        <div className="relative h-[480px] xl:h-[560px]">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-container-lowest/80">
              <span className="text-sm text-on-surface-variant">加载数据中...</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <p className="text-sm text-rose-500">{error}</p>
            </div>
          )}
          <div ref={containerRef} className="w-full h-full" />
        </div>
      </section>

      {/* Info Section */}
      <section className="rounded-[2rem] bg-surface-container-lowest p-7 shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
        <h2 className="font-headline text-base font-bold text-on-surface mb-3">指标说明</h2>

        <p className="text-sm text-on-surface-variant leading-relaxed mb-4">
          AHR999 用于 BTC 长期价值评估，通过对比当前市价与持币者平均成本及链上估值模型，衡量市场整体的高估/低估程度。
        </p>

        {/* Formula */}
        <div className="mb-5 rounded-2xl bg-surface-container px-5 py-3">
          <p className="text-sm font-bold text-on-surface tracking-wide">
            AHR999 &nbsp;=&nbsp; (Price / 200日定投成本) &nbsp;×&nbsp; (Price / 币龄估值)
          </p>
        </div>

        {/* Zone bullets */}
        <ul className="mb-5 space-y-2.5">
          <li className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 shrink-0 font-bold text-emerald-600">·</span>
            <span>
              <span className="font-bold text-emerald-600">AHR999 &lt; 0.45</span>
              <span className="text-on-surface-variant"> — 抄底区，价格处于极度低估，历史上对应较强买入机会</span>
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 shrink-0 font-bold text-amber-600">·</span>
            <span>
              <span className="font-bold text-amber-600">0.45 ≤ AHR999 ≤ 1.2</span>
              <span className="text-on-surface-variant"> — 定投区，适合持续定期投入，价格未明显高估</span>
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 shrink-0 font-bold text-rose-600">·</span>
            <span>
              <span className="font-bold text-rose-600">AHR999 &gt; 1.2</span>
              <span className="text-on-surface-variant"> — 观望区，价格已显著高于成本基础，注意回调风险</span>
            </span>
          </li>
        </ul>

        {/* Footer note */}
        <p className="text-xs text-on-surface-variant/70 leading-relaxed border-t border-outline-variant/20 pt-4">
          ⚠ 币龄估值（拟合价格）基于幂律回归：Price = 10^(5.84 × log10(距创世块天数) − 17.3)，反映 BTC 价格随时间的长期增长趋势。
          200日定投成本为过去 200 个交易日的收盘均价。数据来源：Binance K 线，每日更新。
        </p>
      </section>
    </div>
  );
}
