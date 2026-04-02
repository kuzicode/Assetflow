import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineSeries, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { apiFetch } from '../lib/api';

interface MvrvHistoryItem {
  date: string;
  mvrv: number;
  price: number;
}

interface MvrvResponse {
  current: {
    mvrv: number;
    price: number;
    status: string;
    percentile: number;
  };
  history: MvrvHistoryItem[];
  timestamp: string;
}

function toUTCTimestamp(dateStr: string): UTCTimestamp {
  return Math.floor(new Date(dateStr).getTime() / 1000) as UTCTimestamp;
}

function getMvrvColorClass(status: string) {
  if (status === '低估区') return { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
  if (status === '高估区') return { text: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' };
  return { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
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

export default function MvrvAnalysis() {
  const [data, setData] = useState<MvrvResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mvrvVisible, setMvrvVisible] = useState(true);
  const [priceVisible, setPriceVisible] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mvrvSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...CHART_OPTIONS,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    // MVRV on right scale (primary)
    const mvrvSeries = chart.addSeries(LineSeries, {
      color: '#00855d',
      lineWidth: 2,
      priceScaleId: 'right',
      priceLineVisible: true,
      lastValueVisible: true,
      title: 'MVRV',
    });

    // Threshold lines on MVRV series
    mvrvSeries.createPriceLine({ price: 1.0, color: '#34c38f', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '1.0' });
    mvrvSeries.createPriceLine({ price: 3.0, color: '#e07a5f', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '3.0' });

    // BTC price on left scale (secondary)
    const priceSeries = chart.addSeries(LineSeries, {
      color: '#94a3b8',
      lineWidth: 1,
      priceScaleId: 'left',
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'BTC',
    });

    chartRef.current = chart;
    mvrvSeriesRef.current = mvrvSeries;
    priceSeriesRef.current = priceSeries;

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
      mvrvSeriesRef.current = null;
      priceSeriesRef.current = null;
    };
  }, []);

  // Update chart data
  useEffect(() => {
    if (!data || !mvrvSeriesRef.current || !priceSeriesRef.current) return;

    const mvrvPts = data.history.map((item) => ({
      time: toUTCTimestamp(item.date),
      value: item.mvrv,
    }));
    const pricePts = data.history.map((item) => ({
      time: toUTCTimestamp(item.date),
      value: item.price,
    }));

    mvrvSeriesRef.current.setData(mvrvPts);
    priceSeriesRef.current.setData(pricePts);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch('/api/indicators/mvrv');
      setData(result as MvrvResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MVRV 数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const statusColors = data ? getMvrvColorClass(data.current.status) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Cards */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Current MVRV */}
        <div className="rounded-[2rem] bg-surface-container-lowest p-5 shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
          <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-outline">当前 MVRV</p>
          <p className={`font-mono-data text-2xl font-bold ${statusColors?.text ?? 'text-on-surface'}`}>
            {data ? data.current.mvrv.toFixed(3) : '—'}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">市值 / 已实现市值</p>
        </div>

        {/* Market Status */}
        <div className="rounded-[2rem] bg-surface-container-lowest p-5 shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
          <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-outline">市场状态</p>
          {data ? (
            <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${statusColors?.bg} ${statusColors?.text} border ${statusColors?.border}`}>
              {data.current.status}
            </span>
          ) : (
            <p className="font-mono-data text-2xl font-bold text-on-surface">—</p>
          )}
          <p className="mt-2 text-xs text-on-surface-variant">
            {data?.current.status === '低估区' && '链上成本 > 市值，底部区域'}
            {data?.current.status === '合理区' && '当前估值处于合理范围'}
            {data?.current.status === '高估区' && '市值显著偏离链上成本'}
          </p>
        </div>

        {/* Historical Percentile */}
        <div className="rounded-[2rem] bg-surface-container-lowest p-5 shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
          <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-outline">历史分位</p>
          <p className="font-mono-data text-2xl font-bold text-on-surface">
            {data ? `${data.current.percentile}%` : '—'}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">高于历史 {data ? data.current.percentile : '—'}% 的时间</p>
        </div>

        {/* BTC Price */}
        <div className="rounded-[2rem] bg-surface-container-lowest p-5 shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
          <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-outline">BTC 价格</p>
          <p className="font-mono-data text-2xl font-bold text-on-surface">
            {data ? `$${data.current.price.toLocaleString()}` : '—'}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            {data ? `更新于 ${data.timestamp.slice(0, 10)}` : '—'}
          </p>
        </div>
      </section>

      {/* Chart */}
      <section className="rounded-[2rem] bg-surface-container-lowest shadow-[0px_12px_32px_rgba(25,28,29,0.04)] overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-headline text-base font-bold text-on-surface">MVRV 历史走势</h2>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-600">&lt; 1.0 低估</span>
            <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-600">1.0 ~ 3.0 合理</span>
            <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-600">&gt; 3.0 高估</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !mvrvVisible;
                setMvrvVisible(next);
                mvrvSeriesRef.current?.applyOptions({ visible: next });
              }}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                mvrvVisible
                  ? 'border-[#00855d] bg-emerald-50 text-[#00855d]'
                  : 'border-outline-variant bg-surface-container text-on-surface-variant line-through'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${mvrvVisible ? 'bg-[#00855d]' : 'bg-outline-variant'}`} />
              MVRV
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
          MVRV（Market Value to Realized Value）通过比较比特币的流通市值与实现市值，
          评估当前市场价格相对于全网持币者平均成本的偏离程度，是识别市场周期顶部和底部的重要链上指标。
        </p>

        {/* Formula */}
        <div className="mb-5 rounded-2xl bg-surface-container px-5 py-3">
          <p className="text-sm font-bold text-on-surface tracking-wide">
            MVRV &nbsp;=&nbsp; 流通市值 <span className="text-outline font-normal">(Market Cap)</span>
            &nbsp;/&nbsp; 实现市值 <span className="text-outline font-normal">(Realized Cap)</span>
          </p>
        </div>

        {/* Zone bullets */}
        <ul className="mb-5 space-y-2.5">
          <li className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 shrink-0 font-bold text-emerald-600">·</span>
            <span>
              <span className="font-bold text-emerald-600">MVRV &lt; 1.0</span>
              <span className="text-on-surface-variant"> — 市场整体处于浮亏状态，历史上往往对应周期底部附近</span>
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 shrink-0 font-bold text-amber-600">·</span>
            <span>
              <span className="font-bold text-amber-600">1.0 ≤ MVRV ≤ 3.0</span>
              <span className="text-on-surface-variant"> — 市场估值处于合理区间，持币者整体盈利但尚未过热</span>
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 shrink-0 font-bold text-rose-600">·</span>
            <span>
              <span className="font-bold text-rose-600">MVRV &gt; 3.0</span>
              <span className="text-on-surface-variant"> — 市场可能已经过热，历史上多次触接近周期顶部</span>
            </span>
          </li>
        </ul>

        {/* Footer note */}
        <p className="text-xs text-on-surface-variant/70 leading-relaxed border-t border-outline-variant/20 pt-4">
          ⚠ 实现市值基于链上 UTXO 最后移动时的价格加权计算，反映的是全网持币者的合成成本基础。
          该指标适用于宏观周期判断，短期波动中参考价值有限。数据来源：bitcoin-data.com，每日更新。
        </p>
      </section>
    </div>
  );
}
