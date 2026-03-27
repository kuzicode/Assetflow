import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

function fmtAmount(value: number, maxFractionDigits = 4) {
  return value.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

function fmtUsd(value: number, maxFractionDigits = 0) {
  return value.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

function fmtMMDD(dateStr: string) {
  const d = new Date(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// 加密风格：绿涨红跌
function pnlColor(value: number) {
  return value >= 0 ? 'text-primary' : 'text-error';
}

/** 周度/月度 P&L 表共享样式（疏朗横向排版） */
const PNL_TABLE_HEAD_ROW =
  'bg-surface-container-low text-xs font-black text-outline uppercase tracking-wide';
const pnlThFirst = 'px-3 md:px-4 py-3 min-w-[140px] align-bottom';
const pnlThNum = 'px-3 md:px-4 py-3 text-right whitespace-nowrap align-bottom';
const pnlThAction = 'px-2 md:px-3 py-3 whitespace-nowrap align-bottom';
const pnlTdFirst = 'px-3 md:px-4 py-4 min-w-[140px]';
const pnlTdNum = 'px-3 md:px-4 py-4 text-right font-mono-data tabular-nums whitespace-nowrap';
const pnlTdNumBold = 'px-3 md:px-4 py-4 text-right font-mono-data font-bold tabular-nums whitespace-nowrap';
const pnlTdHeadline = 'px-3 md:px-4 py-4 text-right font-headline font-black tabular-nums whitespace-nowrap';
const pnlTdStatus = 'px-3 md:px-4 py-4 text-right text-xs font-bold whitespace-nowrap';
const pnlTdAction = 'px-2 md:px-3 py-4 text-right whitespace-nowrap';

export default function Dashboard() {
  const { revenueOverview, weeklyPnl, monthlyPnl, positions, manualAssets, prices, authMode, fetchRevenueOverview, fetchWeeklyPnl, fetchMonthlyPnl, loadPositions, fetchManualAssets, updateRevenueOverview, createWeeklyPnl, createMonthlyPnl, updatePnlRecord, deletePnlRecord } = useStore();
  const isAdmin = authMode === 'admin';

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ startDate: '', initialInvestment: '', fairValue: '', periodLabel: '' });
  const [saving, setSaving] = useState(false);

  const [showMonthlyForm, setShowMonthlyForm] = useState(false);
  const [monthlyForm, setMonthlyForm] = useState({ month: '' });
  const [showWeeklyForm, setShowWeeklyForm] = useState(false);
  const [weeklyForm, setWeeklyForm] = useState({ startDate: '', endDate: '', startingCapital: '' });
  const [savingMonthly, setSavingMonthly] = useState(false);
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ startDate: '', endDate: '', startingCapital: '', pnl: '', days: '' });
  const [monthlyPage, setMonthlyPage] = useState(1);
  const [weeklyPage, setWeeklyPage] = useState(1);

  useEffect(() => {
    fetchRevenueOverview();
    fetchWeeklyPnl();
    fetchMonthlyPnl();
    loadPositions();
    fetchManualAssets();
  }, []);

  const PAGE_SIZE = 4;
  const monthlyTotalPages = Math.max(1, Math.ceil(monthlyPnl.length / PAGE_SIZE));
  const weeklyTotalPages = Math.max(1, Math.ceil(weeklyPnl.length / PAGE_SIZE));
  const safeMonthlyPage = Math.min(monthlyPage, monthlyTotalPages);
  const safeWeeklyPage = Math.min(weeklyPage, weeklyTotalPages);
  const monthlyPageRows = monthlyPnl.slice((safeMonthlyPage - 1) * PAGE_SIZE, safeMonthlyPage * PAGE_SIZE);
  const weeklyPageRows = weeklyPnl.slice((safeWeeklyPage - 1) * PAGE_SIZE, safeWeeklyPage * PAGE_SIZE);

  // Total from positions (for auto-fill hint)
  const totalUsd = positions.reduce((s, p) => s + p.totalUsdValue, 0);
  const manualUsd = manualAssets.reduce((s, a) => {
    const price = a.baseToken === 'STABLE' ? 1 : (prices[a.baseToken] || 0);
    return s + a.amount * price;
  }, 0);
  const positionsTotalUsd = totalUsd + manualUsd;

  const handleEditOpen = () => {
    setFormData({
      startDate: revenueOverview?.startDate || '',
      initialInvestment: String(revenueOverview?.initialInvestment || ''),
      fairValue: String(revenueOverview?.fairValue || ''),
      periodLabel: revenueOverview?.periodLabel || '',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const initialInvestment = parseFloat(formData.initialInvestment) || 0;
      const fairValue = parseFloat(formData.fairValue) || 0;
      const cashValue = positionsTotalUsd;
      const profit = fairValue - initialInvestment;
      const returnRate = initialInvestment > 0 ? profit / initialInvestment : 0;
      const start = new Date(formData.startDate);
      const runningDays = Math.max(1, Math.round((Date.now() - start.getTime()) / 86400000));
      const annualizedReturn = returnRate / runningDays * 365;
      await updateRevenueOverview({
        periodLabel: formData.periodLabel,
        startDate: formData.startDate,
        initialInvestment,
        fairValue,
        cashValue,
        profit,
        returnRate,
        runningDays,
        annualizedReturn,
      });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMonthly = async () => {
    setSavingMonthly(true);
    try {
      await createMonthlyPnl({
        month: monthlyForm.month,
        auto: true,
      });
      setMonthlyForm({ month: '' });
      setShowMonthlyForm(false);
      setMonthlyPage(1);
    } finally {
      setSavingMonthly(false);
    }
  };

  const handleSaveWeekly = async () => {
    setSavingWeekly(true);
    try {
      await createWeeklyPnl({
        startDate: weeklyForm.startDate,
        endDate: weeklyForm.endDate || undefined,
        startingCapital: weeklyForm.startingCapital ? (parseFloat(weeklyForm.startingCapital) || 0) : undefined,
      });
      setWeeklyForm({ startDate: '', endDate: '', startingCapital: '' });
      setShowWeeklyForm(false);
      await fetchWeeklyPnl();
      setWeeklyPage(1);
    } finally {
      setSavingWeekly(false);
    }
  };

  function computeAutoStartingCapital(list: any[], rec: any) {
    const idx = list.findIndex((r) => r.id === rec.id);
    const prev = idx >= 0 ? list[idx + 1] : null; // 列表为倒序展示，下一行是“上一条（更早）”
    if (!prev) return rec.startingCapital ?? 0;
    const v = (Number(prev.startingCapital) || 0) + (Number(prev.pnl) || 0);
    return Number.isFinite(v) ? v : (rec.startingCapital ?? 0);
  }

  const openEdit = (rec: any, list: any[]) => {
    const autoStart = computeAutoStartingCapital(list, rec);
    setEditingId(rec.id);
    setEditForm({
      startDate: rec.startDate || '',
      endDate: rec.endDate || '',
      startingCapital: String(Math.round(autoStart)),
      pnl: String(rec.pnl ?? ''),
      days: String(rec.days ?? ''),
    });
  };

  const saveEdit = async (id: string) => {
    await updatePnlRecord(id, {
      startDate: editForm.startDate,
      endDate: editForm.endDate,
      startingCapital: parseFloat(editForm.startingCapital) || 0,
      pnl: parseFloat(editForm.pnl) || 0,
      days: parseInt(editForm.days) || 1,
    } as any);
    setEditingId(null);
  };

  const stablePos = positions.find((p) => p.baseToken === 'STABLE');
  const ethPos = positions.find((p) => p.baseToken === 'ETH');
  const bnbPos = positions.find((p) => p.baseToken === 'BNB');

  const manualStableUsd = manualAssets
    .filter((a) => a.baseToken === 'STABLE')
    .reduce((s, a) => s + a.amount * 1, 0);

  const stableTotalUsd = (stablePos?.totalUsdValue || 0) + manualStableUsd;
  const stableSubs = stablePos?.subPositions || [];

  const stableUniswapLpUsd = stableSubs
    .filter((s) => (s.protocol || '').toLowerCase().includes('uniswap') && s.source === 'lp')
    .reduce((sum, s) => sum + (s.usdValue || 0), 0);
  const stableHlpUsd = stableSubs
    .filter((s) => (s.protocol || '').toLowerCase().includes('hyperliquid') || s.source === 'hlp')
    .reduce((sum, s) => sum + (s.usdValue || 0), 0);
  const stableMorphoUsd = stableSubs
    .filter((s) => (s.protocol || '').toLowerCase().includes('morpho'))
    .reduce((sum, s) => sum + (s.usdValue || 0), 0);

  // 交易所与现金：包含手动稳定币 + 钱包稳定币 + 其余未命中的稳定币子项，保证占比总和为 100%
  const stableKnownDefiUsd = stableUniswapLpUsd + stableHlpUsd + stableMorphoUsd;
  const stableCexCashUsd = Math.max(0, stableTotalUsd - stableKnownDefiUsd);

  const pct = (v: number) => (stableTotalUsd > 0 ? (v / stableTotalUsd) * 100 : 0);

  const manualEthAmount = manualAssets
    .filter((a) => a.baseToken === 'ETH')
    .reduce((s, a) => s + Number(a.amount || 0), 0);
  const manualBnbAmount = manualAssets
    .filter((a) => a.baseToken === 'BNB')
    .reduce((s, a) => s + Number(a.amount || 0), 0);
  const manualEthUsd = manualEthAmount * (prices.ETH || 0);
  const manualBnbUsd = manualBnbAmount * (prices.BNB || 0);

  const ethDisplayAmount = (ethPos?.totalAmount || 0);
  const ethDisplayUsd = (ethPos?.totalUsdValue || 0) + manualEthUsd;
  const bnbDisplayAmount = (bnbPos?.totalAmount || 0);
  const bnbDisplayUsd = (bnbPos?.totalUsdValue || 0) + manualBnbUsd;

  const r = revenueOverview;
  const runningTime = r ? `${r.periodLabel}:${fmtMMDD(r.startDate)}-${fmtMMDD(new Date().toISOString())}` : '未设置';
  // 始终用实时仓位总额，确保与资金数据页对齐
  const liveCashValue = positionsTotalUsd;
  const unrealizedPnl = r ? liveCashValue - r.fairValue : 0;
  const isInProgress = (rec: any) => rec.status === 'in_progress';
  const rowClass = (rec: any) => isInProgress(rec) ? 'text-yellow-600' : '';
  const isLatestMonthly = (rec: any) => monthlyPnl.length > 0 && monthlyPnl[0].id === rec.id;
  const isLatestWeekly = (rec: any) => weeklyPnl.length > 0 && weeklyPnl[0].id === rec.id;
  const latestNumberClass = (isLatest: boolean) => (isLatest ? 'text-yellow-600' : '');
  const weekLabel = (rec: any, list: any[]) => {
    // 用 endDate 的月份来归类（如 0131-0205 视为 2月第1周），并按同月顺序编号，避免 0107 这种导致“第1周”重复
    const end = new Date(`${rec.endDate}T00:00:00`);
    const month = end.getMonth() + 1;
    const sameMonth = list
      .filter((r) => {
        const e = new Date(`${r.endDate}T00:00:00`);
        return e.getMonth() + 1 === month;
      })
      .slice()
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const idx = sameMonth.findIndex((r) => r.id === rec.id);
    const weekNo = idx >= 0 ? idx + 1 : 1;
    return `${month}月第${weekNo}周`;
  };

  const monthlySeries = monthlyPnl
    .slice()
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .map((r) => {
      // 月度按结束日期归属月份，避免 0131-0228 被显示成 1月
      const d = new Date(`${r.endDate}T00:00:00`);
      const label = `${d.getMonth() + 1}月`;
      return { label, pnl: Number(r.pnl || 0) };
    });

  const weeklySeriesChrono = weeklyPnl
    .slice()
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .map((r) => {
      const label = fmtMMDD(r.endDate);
      return { label, pnl: Number(r.pnl || 0) };
    });

  const tooltipFormatter = (value: any) => [Number(value).toLocaleString(), '本位盈亏'];

  return (
    <div className="space-y-12">

      {/* Hero Section: Revenue Overview */}
      <section className="relative">
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-primary-fixed/20 blur-3xl rounded-full -z-10" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Main KPI Card */}
          <div className="lg:col-span-3 bg-surface-container-lowest rounded-[2rem] p-8 relative overflow-hidden">
            {isAdmin && !isEditing && (
              <button
                onClick={handleEditOpen}
                className="absolute top-6 right-6 p-2 rounded-xl text-outline hover:text-primary hover:bg-primary-fixed/20 transition-colors"
                title="录入收益总览"
              >
                <span className="material-symbols-outlined text-xl">edit</span>
              </button>
            )}
            <div className="flex justify-between items-start mb-10">
              <div>
                <span className="px-3 py-1 bg-primary-fixed text-on-primary-fixed rounded-full text-xs font-bold tracking-wider mb-4 inline-block">
                  收益概览 &bull; PRIMARY REVENUE
                </span>
                <h3 className="text-4xl font-headline font-bold text-on-surface">
                  {r ? r.fairValue.toLocaleString() : '0'}
                  <span className="text-xl font-normal text-on-surface-variant ml-2">~USDT</span>
                </h3>
                <p className="text-on-surface-variant flex items-center mt-1 text-sm">
                  <span className="material-symbols-outlined text-sm mr-1">history</span>
                  运行时间:
                  <span className="font-mono-data ml-2">{runningTime}</span>
                </p>
              </div>
              <div className="text-right flex flex-col items-end justify-start pt-10 md:pt-9 min-w-[120px]">
                <p className="text-xs font-bold text-outline tracking-widest uppercase mb-2 leading-none whitespace-nowrap">
                  综合年化
                </p>
                <p
                  className={`font-headline font-black leading-none whitespace-nowrap text-3xl md:text-4xl ${r ? pnlColor(r.annualizedReturn) : 'text-on-surface-variant'}`}
                >
                  {r ? `${(r.annualizedReturn * 100).toFixed(2)}%` : '0.00%'}
                </p>
              </div>
            </div>

            {/* Edit form */}
            {isEditing && (
              <div className="mb-8 p-6 bg-surface-container-low rounded-2xl space-y-4">
                <p className="text-xs font-bold text-outline uppercase tracking-widest">录入基础数据</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">年份标签</label>
                    <input
                      type="text"
                      value={formData.periodLabel}
                      onChange={(e) => setFormData((f) => ({ ...f, periodLabel: e.target.value }))}
                      placeholder="如：2026年"
                      className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-2 text-on-surface text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">开始日期</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData((f) => ({ ...f, startDate: e.target.value }))}
                      className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-2 text-on-surface text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">起始投资额 (USDT)</label>
                    <input
                      type="number"
                      value={formData.initialInvestment}
                      onChange={(e) => setFormData((f) => ({ ...f, initialInvestment: e.target.value }))}
                      placeholder="0"
                      className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-2 text-on-surface text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant flex items-center justify-between">
                      <span>账面公允价值 (USDT)</span>
                      <button
                        type="button"
                        onClick={() => setFormData((f) => ({ ...f, fairValue: String(Math.round(positionsTotalUsd)) }))}
                        className="text-primary text-[10px] font-bold hover:opacity-70 transition-opacity"
                        title="从当前仓位获取"
                      >
                        从仓位获取
                      </button>
                    </label>
                    <input
                      type="number"
                      value={formData.fairValue}
                      onChange={(e) => setFormData((f) => ({ ...f, fairValue: e.target.value }))}
                      placeholder="0"
                      className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-2 text-on-surface text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleSave}
                    disabled={saving || !formData.startDate || !formData.initialInvestment || !formData.fairValue}
                    className="px-6 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    disabled={saving}
                    className="px-6 py-2 text-on-surface-variant hover:text-on-surface text-sm transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* Metrics grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div className="space-y-1">
                <p className="text-xs font-medium text-on-surface-variant/70 uppercase">起始投资额</p>
                <p className="text-xl font-headline font-bold text-on-surface">
                  {r ? r.initialInvestment.toLocaleString() : '0'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-on-surface-variant/70 uppercase">利润</p>
                <p className={`text-xl font-headline font-bold ${r ? pnlColor(r.profit) : 'text-on-surface-variant'}`}>
                  {r ? `${r.profit >= 0 ? '+' : ''}${r.profit.toLocaleString()}` : '0'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-on-surface-variant/70 uppercase">收益率</p>
                <p className={`text-xl font-headline font-bold ${r ? pnlColor(r.returnRate) : 'text-on-surface-variant'}`}>
                  {r ? `${(r.returnRate * 100).toFixed(2)}%` : '0.00%'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-on-surface-variant/70 uppercase">运行天数</p>
                <p className="text-xl font-headline font-bold text-on-surface">
                  {r ? r.runningDays : 0} <span className="text-sm font-normal text-outline">DAYS</span>
                </p>
              </div>
            </div>

            {/* Cash value & unrealized PnL */}
            <div className="mt-8 pt-8 border-t border-surface-container-high grid grid-cols-2 gap-8">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-xl bg-secondary-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-secondary">payments</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-outline uppercase">账面现金价值</p>
                  <p className="text-lg font-mono-data font-bold text-on-surface-variant">
                    {liveCashValue > 0 ? liveCashValue.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-surface-variant">swap_vert</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-outline uppercase">账面变动损益</p>
                  <p className="text-lg font-mono-data font-bold text-on-surface-variant">
                    {r ? `${unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toLocaleString()}` : '0'}
                  </p>
                  <p className="text-[10px] text-outline/50 mt-0.5 italic leading-tight max-w-[200px]">
                    公允价值不含无偿损失，现金价值含
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Asset Distribution (text) */}
          <div className="bg-surface-container-lowest rounded-[2rem] p-8">
            <h4 className="text-sm font-bold text-outline mb-6 uppercase tracking-widest">资产分配</h4>

            <div className="space-y-6">
              <div>
                <div className="flex items-baseline justify-between">
                  <div className="text-sm font-black text-on-surface">稳定币</div>
                  <div className="text-sm font-mono-data font-black text-on-surface-variant">
                    {fmtUsd(stableTotalUsd)} <span className="text-xs font-bold text-outline">USDT</span>
                  </div>
                </div>
                <div className="mt-3 space-y-2 text-sm text-on-surface-variant">
                  <div className="flex justify-between">
                    <span>- Uniswap ETH LP</span>
                    <span className="font-mono-data">{pct(stableUniswapLpUsd).toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>- HLP</span>
                    <span className="font-mono-data">{pct(stableHlpUsd).toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>- Morpho借贷</span>
                    <span className="font-mono-data">{pct(stableMorphoUsd).toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>- 交易所与现金</span>
                    <span className="font-mono-data">{pct(stableCexCashUsd).toFixed(2)}%</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-surface-container">
                <div className="flex items-baseline justify-between">
                  <div className="text-sm font-black text-on-surface">ETH</div>
                  <div className="text-sm font-mono-data font-black text-on-surface-variant">
                    {fmtAmount(ethDisplayAmount, 4)}
                    <span className="text-xs font-bold text-outline ml-2">
                      (~{fmtUsd(ethDisplayUsd)} USD)
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-surface-container">
                <div className="flex items-baseline justify-between">
                  <div className="text-sm font-black text-on-surface">BNB</div>
                  <div className="text-sm font-mono-data font-black text-on-surface-variant">
                    {fmtAmount(bnbDisplayAmount, 4)}
                    <span className="text-xs font-bold text-outline ml-2">
                      (~{fmtUsd(bnbDisplayUsd)} USD)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Monthly & Weekly P&L Tables */}
      <section className="space-y-12">
        {/* Monthly P&L */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-headline font-bold text-on-surface">月度盈亏情况</h3>
            {isAdmin && (
              <button
                onClick={() => setShowMonthlyForm((v) => !v)}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-base">{showMonthlyForm ? 'close' : 'add'}</span>
                {showMonthlyForm ? '取消' : '录入'}
              </button>
            )}
          </div>

          {/* Entry form */}
          {showMonthlyForm && (
            <div className="bg-surface-container-low rounded-2xl p-6 space-y-4">
              <p className="text-xs font-black text-outline uppercase tracking-widest">新增月度记录（不需要填起始资金）</p>
              <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-on-surface-variant">月份</label>
                  <input
                    type="month"
                    value={monthlyForm.month}
                    onChange={(e) => setMonthlyForm((f) => ({ ...f, month: e.target.value }))}
                    className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-2 text-on-surface text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleSaveMonthly}
                  disabled={savingMonthly || !monthlyForm.month}
                  className="px-6 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {savingMonthly ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-3 bg-surface-container-lowest rounded-[2rem] p-6">
              <div className="flex items-baseline justify-between mb-4">
                <h4 className="text-sm font-black text-outline uppercase tracking-widest">月度盈亏走势</h4>
                <span className="text-xs text-outline/70">USDT</span>
              </div>
              <div className="h-[220px]">
                {monthlySeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={monthlySeries} margin={{ top: 10, right: 10, left: 12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} />
                      <Tooltip formatter={tooltipFormatter as any} />
                      <Bar dataKey="pnl" fill="#a8d5c5" radius={[4, 4, 0, 0]} />
                      <Line
                        type="monotone"
                        dataKey="pnl"
                        stroke="#7fa59a"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={{ r: 3, fill: '#7fa59a' }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-on-surface-variant">暂无数据</div>
                )}
              </div>
            </div>

            <div className="lg:col-span-9 bg-surface-container-lowest rounded-[2rem] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className={PNL_TABLE_HEAD_ROW}>
                      <th className={pnlThFirst}>
                        <span className="block leading-tight">月度</span>
                      </th>
                      <th className={pnlThNum}>
                        <span className="block leading-tight">本月盈亏</span>
                      </th>
                      <th className={pnlThNum}>收益率</th>
                      <th className={pnlThNum}>
                        <span className="block leading-tight">投入(天)</span>
                      </th>
                      <th className={pnlThNum}>
                        <span className="block leading-tight">折合年化</span>
                      </th>
                      <th className={pnlThNum}>状态</th>
                      {isAdmin && <th className={pnlThAction} />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {monthlyPageRows.length > 0 ? (
                      monthlyPageRows.map((rec) => {
                        const d = new Date(rec.endDate + 'T00:00:00');
                        const monthLabel = `${d.getFullYear()}年${d.getMonth() + 1}月`;
                        const inEdit = editingId === rec.id;
                        const latest = isLatestMonthly(rec);
                        return (
                          <tr key={rec.id} className={`hover:bg-surface-container-low transition-colors ${rowClass(rec)}`}>
                            <td className={`${pnlTdFirst} font-bold`}>
                              <div>{monthLabel}</div>
                              <div className="text-xs opacity-70">{fmtMMDD(rec.startDate)}-{fmtMMDD(rec.endDate)}</div>
                              {inEdit && (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <input
                                    type="date"
                                    value={editForm.startDate}
                                    onChange={(e) => setEditForm((f) => ({ ...f, startDate: e.target.value }))}
                                    className="bg-surface-container border border-outline-variant rounded px-2 py-1 text-xs"
                                  />
                                  <input
                                    type="date"
                                    value={editForm.endDate}
                                    onChange={(e) => setEditForm((f) => ({ ...f, endDate: e.target.value }))}
                                    className="bg-surface-container border border-outline-variant rounded px-2 py-1 text-xs"
                                  />
                                </div>
                              )}
                            </td>
                            <td className={`${pnlTdNumBold} ${pnlColor(rec.pnl)} ${latestNumberClass(latest)}`}>
                              {inEdit ? (
                                <input type="number" value={editForm.pnl} onChange={(e) => setEditForm((f) => ({ ...f, pnl: e.target.value }))} className="w-28 text-right bg-surface-container border border-outline-variant rounded px-2 py-1" />
                              ) : (
                                <>{rec.pnl >= 0 ? '+' : ''}{rec.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</>
                              )}
                            </td>
                            <td className={`${pnlTdNum} ${pnlColor(rec.returnRate)} ${latestNumberClass(latest)}`}>
                              {(rec.returnRate * 100).toFixed(2)}%
                            </td>
                            <td className={`${pnlTdNum} ${latestNumberClass(latest)}`}>
                              {inEdit ? (
                                <input type="number" value={editForm.days} onChange={(e) => setEditForm((f) => ({ ...f, days: e.target.value }))} className="w-20 text-right bg-surface-container border border-outline-variant rounded px-2 py-1" />
                              ) : rec.days}
                            </td>
                            <td className={`${pnlTdHeadline} ${pnlColor(rec.annualizedReturn)} ${latestNumberClass(latest)}`}>
                              {(rec.annualizedReturn * 100).toFixed(2)}%
                            </td>
                            <td className={pnlTdStatus}>
                              {isInProgress(rec) ? '进行中待修正' : '已结算'}
                            </td>
                            {isAdmin && (
                              <td className={`${pnlTdAction} space-x-2`}>
                                {inEdit ? (
                                  <>
                                    <button onClick={() => saveEdit(rec.id)} className="text-primary">保存</button>
                                    <button onClick={() => setEditingId(null)} className="text-outline">取消</button>
                                  </>
                                ) : (
                                  <button onClick={() => openEdit(rec, monthlyPnl as any)} className="text-primary">编辑</button>
                                )}
                                <button onClick={() => deletePnlRecord(rec.id)} className="text-outline hover:text-error transition-colors">
                                  <span className="material-symbols-outlined text-base">delete</span>
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={isAdmin ? 7 : 6} className="px-4 py-8 text-center text-on-surface-variant">暂无月度数据</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          {monthlyPnl.length > PAGE_SIZE && (
            <div className="flex items-center justify-start gap-3 pt-2">
              <button
                className="px-3 py-1 rounded-lg text-sm text-on-surface-variant hover:text-on-surface disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setMonthlyPage((p) => Math.max(1, p - 1))}
                disabled={safeMonthlyPage <= 1}
              >
                上一页
              </button>
              <span className="text-xs font-mono-data text-outline">
                {safeMonthlyPage} / {monthlyTotalPages}
              </span>
              <button
                className="px-3 py-1 rounded-lg text-sm text-on-surface-variant hover:text-on-surface disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setMonthlyPage((p) => Math.min(monthlyTotalPages, p + 1))}
                disabled={safeMonthlyPage >= monthlyTotalPages}
              >
                下一页
              </button>
            </div>
          )}
        </div>

        {/* Weekly P&L */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-headline font-bold text-on-surface">周度盈亏情况</h3>
            {isAdmin && (
              <button
                onClick={() => setShowWeeklyForm((v) => !v)}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-base">{showWeeklyForm ? 'close' : 'add'}</span>
                {showWeeklyForm ? '取消' : '录入'}
              </button>
            )}
          </div>
          {showWeeklyForm && (
            <div className="bg-surface-container-low rounded-2xl p-6 space-y-4">
              <p className="text-xs font-black text-outline uppercase tracking-widest">新增周度记录（只填开始日期即可自动计算）</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-on-surface-variant">起始日期</label>
                  <input type="date" value={weeklyForm.startDate} onChange={(e) => setWeeklyForm((f) => ({ ...f, startDate: e.target.value }))} className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-2 text-on-surface text-sm focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-on-surface-variant">结束日期（可选：补历史数据）</label>
                  <input type="date" value={weeklyForm.endDate} onChange={(e) => setWeeklyForm((f) => ({ ...f, endDate: e.target.value }))} className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-2 text-on-surface text-sm focus:outline-none focus:border-primary" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-on-surface-variant">起始资产 (USDT，可选：默认取上一条结算值)</label>
                  <input type="number" value={weeklyForm.startingCapital} onChange={(e) => setWeeklyForm((f) => ({ ...f, startingCapital: e.target.value }))} className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-2 text-on-surface text-sm focus:outline-none focus:border-primary" />
                </div>
              </div>
              <button onClick={handleSaveWeekly} disabled={savingWeekly || !weeklyForm.startDate} className="px-6 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
                {savingWeekly ? '保存中...' : '保存'}
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-3 bg-surface-container-lowest rounded-[2rem] p-6">
              <div className="flex items-baseline justify-between mb-4">
                <h4 className="text-sm font-black text-outline uppercase tracking-widest">周度盈亏走势</h4>
                <span className="text-xs text-outline/70">USDT</span>
              </div>
              <div className="h-[220px]">
                {weeklySeriesChrono.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={weeklySeriesChrono} margin={{ top: 10, right: 10, left: 12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} />
                      <Tooltip formatter={tooltipFormatter as any} />
                      <Bar dataKey="pnl" fill="#a8d5c5" radius={[4, 4, 0, 0]} />
                      <Line
                        type="monotone"
                        dataKey="pnl"
                        stroke="#7fa59a"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={{ r: 3, fill: '#7fa59a' }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-on-surface-variant">暂无数据</div>
                )}
              </div>
            </div>

            <div className="lg:col-span-9 bg-surface-container-lowest rounded-[2rem] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left">
                  <thead>
                    <tr className={PNL_TABLE_HEAD_ROW}>
                      <th className={pnlThFirst}>
                        <span className="block leading-tight">周度</span>
                      </th>
                      <th className={pnlThNum}>起始资产</th>
                      <th className={pnlThNum}>
                        <span className="block leading-tight">本周盈亏</span>
                      </th>
                      <th className={pnlThNum}>收益率</th>
                      <th className={pnlThNum}>
                        <span className="block leading-tight">投入(天)</span>
                      </th>
                      <th className={pnlThNum}>
                        <span className="block leading-tight">折合年化</span>
                      </th>
                      <th className={pnlThNum}>状态</th>
                      {isAdmin && <th className={pnlThAction} />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {weeklyPageRows.length > 0 ? (
                      weeklyPageRows.map((rec) => {
                        const inEdit = editingId === rec.id;
                        const latest = isLatestWeekly(rec);
                        return (
                          <tr key={rec.id} className={`hover:bg-surface-container-low transition-colors ${rowClass(rec)}`}>
                            <td className={`${pnlTdFirst} font-bold`}>
                              <div>{weekLabel(rec, weeklyPnl as any)}</div>
                              <div className="text-xs opacity-70">{fmtMMDD(rec.startDate)}-{fmtMMDD(rec.endDate)}</div>
                              {inEdit && (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <input
                                    type="date"
                                    value={editForm.startDate}
                                    onChange={(e) => setEditForm((f) => ({ ...f, startDate: e.target.value }))}
                                    className="bg-surface-container border border-outline-variant rounded px-2 py-1 text-xs"
                                  />
                                  <input
                                    type="date"
                                    value={editForm.endDate}
                                    onChange={(e) => setEditForm((f) => ({ ...f, endDate: e.target.value }))}
                                    className="bg-surface-container border border-outline-variant rounded px-2 py-1 text-xs"
                                  />
                                </div>
                              )}
                            </td>
                            <td className={`${pnlTdNum} ${latestNumberClass(latest)}`}>
                              {inEdit ? (
                                <input type="number" value={editForm.startingCapital} readOnly className="w-28 text-right bg-surface-container border border-outline-variant rounded px-2 py-1 opacity-70" />
                              ) : rec.startingCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                            <td className={`${pnlTdNumBold} ${pnlColor(rec.pnl)} ${latestNumberClass(latest)}`}>
                              {inEdit ? (
                                <input type="number" value={editForm.pnl} onChange={(e) => setEditForm((f) => ({ ...f, pnl: e.target.value }))} className="w-28 text-right bg-surface-container border border-outline-variant rounded px-2 py-1" />
                              ) : (
                                <>{rec.pnl >= 0 ? '+' : ''}{rec.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</>
                              )}
                            </td>
                            <td className={`${pnlTdNum} ${pnlColor(rec.returnRate)} ${latestNumberClass(latest)}`}>{(rec.returnRate * 100).toFixed(2)}%</td>
                            <td className={`${pnlTdNum} ${latestNumberClass(latest)}`}>
                              {inEdit ? (
                                <input type="number" value={editForm.days} onChange={(e) => setEditForm((f) => ({ ...f, days: e.target.value }))} className="w-20 text-right bg-surface-container border border-outline-variant rounded px-2 py-1" />
                              ) : rec.days}
                            </td>
                            <td className={`${pnlTdHeadline} ${pnlColor(rec.annualizedReturn)} ${latestNumberClass(latest)}`}>{(rec.annualizedReturn * 100).toFixed(2)}%</td>
                            <td className={pnlTdStatus}>
                              {isInProgress(rec) ? '进行中待修正' : rec.status === 'locked' ? '已锁定' : '已结算'}
                            </td>
                            {isAdmin && (
                              <td className={pnlTdAction}>
                                {inEdit ? (
                                  <>
                                    <button onClick={() => saveEdit(rec.id)} className="text-primary">保存</button>
                                    <button onClick={() => setEditingId(null)} className="text-outline ml-2">取消</button>
                                  </>
                                ) : (
                                  <button onClick={() => openEdit(rec, weeklyPnl as any)} className="text-primary">编辑</button>
                                )}
                                <button onClick={() => deletePnlRecord(rec.id)} className="text-outline hover:text-error transition-colors ml-2">
                                  <span className="material-symbols-outlined text-base">delete</span>
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-on-surface-variant">暂无周度数据</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          {weeklyPnl.length > PAGE_SIZE && (
            <div className="flex items-center justify-start gap-3 pt-2">
              <button
                className="px-3 py-1 rounded-lg text-sm text-on-surface-variant hover:text-on-surface disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setWeeklyPage((p) => Math.max(1, p - 1))}
                disabled={safeWeeklyPage <= 1}
              >
                上一页
              </button>
              <span className="text-xs font-mono-data text-outline">
                {safeWeeklyPage} / {weeklyTotalPages}
              </span>
              <button
                className="px-3 py-1 rounded-lg text-sm text-on-surface-variant hover:text-on-surface disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setWeeklyPage((p) => Math.min(weeklyTotalPages, p + 1))}
                disabled={safeWeeklyPage >= weeklyTotalPages}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
