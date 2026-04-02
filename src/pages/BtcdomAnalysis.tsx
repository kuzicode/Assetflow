import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineSeries, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { apiFetch } from '../lib/api';

interface BtcdomHistoryItem {
  date: string;
  dominance: number;
}

interface BtcdomResponse {
  current: {
    dominance: number;
    price: number;
    status: string;
  };
  history: BtcdomHistoryItem[];
  timestamp: string;
}

function toUTCTimestamp(dateStr: string): UTCTimestamp {
  return Math.floor(new Date(dateStr).getTime() / 1000) as UTCTimestamp;
}

function getStatusColors(status: string) {
  if (status === 'BTC主导') return { text: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-200' };
  if (status === '均衡') return { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
  return { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
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
  timeScale: { borderColor: 'rgba(109,122,119,0.25)', timeVisible: false },
  handleScroll: true,
  handleScale: true,
} as const;

export default function BtcdomAnalysis() {
  const [data, setData] = useState<BtcdomResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [btcdomVisible, setBtcdomVisible] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const btcdomSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...CHART_OPTIONS,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    // BTCDOM on right scale (single scale)
    const btcdomSeries = chart.addSeries(LineSeries, {
      color: '#0ea5e9',
      lineWidth: 2,
      priceScaleId: 'right',
      priceLineVisible: true,
      lastValueVisible: true,
      title: 'BTCDOM',
      visible: true,
    });

    btcdomSeries.createPriceLine({ price: 60, color: '#e07a5f', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '60%' });
    btcdomSeries.createPriceLine({ price: 40, color: '#34c38f', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '40%' });

    chartRef.current = chart;
    btcdomSeriesRef.current = btcdomSeries;

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
      btcdomSeriesRef.current = null;
    };
  }, []);

  // Update chart data
  useEffect(() => {
    if (!data || !btcdomSeriesRef.current) return;

    btcdomSeriesRef.current.setData(
      data.history.map((item) => ({ time: toUTCTimestamp(item.date), value: item.dominance })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch('/api/indicators/btcdom');
      setData(result as BtcdomResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BTCDOM 数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const statusColors = data ? getStatusColors(data.current.status) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Cards */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {/* Dominance */}
        <div className="rounded-[2rem] bg-surface-container-lowest p-5 shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
          <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-outline">当前占比</p>
          <p className={`font-mono-data text-2xl font-bold ${statusColors?.text ?? 'text-on-surface'}`}>
            {data ? `${data.current.dominance}%` : '—'}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">BTC市值占加密总市值</p>
        </div>

        {/* Status badge */}
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
            {data?.current.status === 'BTC主导' && '资金集中于 BTC，山寨相对弱势'}
            {data?.current.status === '均衡' && 'BTC 与山寨均衡配置'}
            {data?.current.status === '山寨季' && '资金外溢至山寨，轮动行情'}
          </p>
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
            <h2 className="font-headline text-base font-bold text-on-surface">BTCDOM 历史走势</h2>
            <span className="rounded-full bg-sky-50 border border-sky-200 px-2.5 py-0.5 text-xs font-bold text-sky-600">&gt; 60% BTC主导</span>
            <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-600">40-60% 均衡</span>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-600">&lt; 40% 山寨季</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !btcdomVisible;
                setBtcdomVisible(next);
                btcdomSeriesRef.current?.applyOptions({ visible: next });
              }}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                btcdomVisible
                  ? 'border-sky-500 bg-sky-50 text-sky-600'
                  : 'border-outline-variant bg-surface-container text-on-surface-variant line-through'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${btcdomVisible ? 'bg-sky-500' : 'bg-outline-variant'}`} />
              BTCDOM
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
          BTCDOM（比特币市值占比）衡量比特币在整个加密货币市场中的市值权重，反映资金在 BTC 与山寨币之间的配置偏好。
        </p>

        {/* Formula */}
        <div className="mb-5 rounded-2xl bg-surface-container px-5 py-3">
          <p className="text-sm font-bold text-on-surface tracking-wide">
            BTCDOM &nbsp;=&nbsp; BTC 市值 &nbsp;/&nbsp; 加密货币总市值 &nbsp;×&nbsp; 100%
          </p>
        </div>

        {/* Zone bullets */}
        <ul className="mb-5 space-y-2.5">
          <li className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 shrink-0 font-bold text-sky-600">·</span>
            <span>
              <span className="font-bold text-sky-600">BTCDOM &gt; 60%</span>
              <span className="text-on-surface-variant"> — BTC主导，资金集中于比特币，山寨币相对弱势</span>
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 shrink-0 font-bold text-amber-600">·</span>
            <span>
              <span className="font-bold text-amber-600">40% ≤ BTCDOM ≤ 60%</span>
              <span className="text-on-surface-variant"> — 均衡区，BTC 与山寨资金分配较为均衡</span>
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 shrink-0 font-bold text-emerald-600">·</span>
            <span>
              <span className="font-bold text-emerald-600">BTCDOM &lt; 40%</span>
              <span className="text-on-surface-variant"> — 山寨季，资金大量外溢至小币种，轮动行情显著</span>
            </span>
          </li>
        </ul>

        {/* Footer note */}
        <p className="text-xs text-on-surface-variant/70 leading-relaxed border-t border-outline-variant/20 pt-4">
          ⚠ BTCDOM 受稳定币市值影响较大，若稳定币总市值持续扩张，实际 BTC 主导地位可能被低估。数据来源：CoinGecko，每日更新。
        </p>
      </section>
    </div>
  );
}
