import { useEffect, useCallback } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { apiFetch } from '../lib/api';
import type { NavSection } from '../types/nav';

const COIN_COLORS: Record<string, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#9945FF',
  BNB: '#F3BA2F',
};

const COIN_LABELS: Record<string, string> = {
  BTC: '₿',
  ETH: 'Ξ',
  SOL: '◎',
  BNB: 'B',
};

const navSections: NavSection[] = [
  {
    label: '理财数据管理',
    items: [
      { to: '/', label: '收益总览', icon: 'dashboard' },
      { to: '/positions', label: '仓位数据', icon: 'account_balance_wallet' },
      { to: '/wallets', label: '钱包管理', icon: 'account_balance' },
    ],
  },
  {
    label: '指标数据分析',
    items: [
      { to: '/analysis/ma', label: '币价分析', icon: 'timeline' },
      { to: '/analysis/mvrv', label: 'MVRV', icon: 'monitoring' },
      { to: '/analysis/ahr999', label: 'AHR999', icon: 'show_chart' },
      { to: '/analysis/btcdom', label: 'BTCDOM', icon: 'pie_chart' },
    ],
  },
];

export default function Layout() {
  const navigate = useNavigate();
  const { revenueOverview, authMode, initializeApp, setAuthState, spotPrices, athData, spotPricesUpdatedAt, fetchSpotPrices } = useStore();

  useEffect(() => {
    initializeApp();
  }, []);

  const stableFetchSpotPrices = useCallback(fetchSpotPrices, []);
  useEffect(() => {
    const id = setInterval(stableFetchSpotPrices, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [stableFetchSpotPrices]);

  const handleLogout = async () => {
    try {
      if (authMode === 'admin') {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      }
    } catch {}
    setAuthState({ mode: null, token: null });
    localStorage.removeItem('assetflow_positions_cache');
    localStorage.removeItem('authMode');
    localStorage.removeItem('assetflow_admin_token');
    navigate('/login', { replace: true });
  };

  const isAdmin = authMode === 'admin';

  const totalValue = revenueOverview
    ? `$${revenueOverview.fairValue.toLocaleString()}`
    : '—';

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-50 flex h-screen w-52 flex-col border-r border-outline-variant/30 bg-[linear-gradient(180deg,#f7fbf9_0%,#eef5f1_100%)] py-8">
        <div className="mb-9 px-5">
          <h1 className="text-xl font-bold text-primary font-headline tracking-tight">Trusme Lab</h1>
          <p className="text-xs text-on-surface-variant/60 font-medium mt-1">Crypto 综合数据看板</p>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3">
          {navSections.map((section) => (
            <section key={section.label}>
              <div className="px-2.5 pb-3">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-outline">{section.label}</p>
              </div>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      isActive
                        ? 'flex items-center gap-3 rounded-2xl bg-primary-fixed px-3.5 py-3 text-primary font-bold transition-all duration-200 shadow-[0px_10px_24px_rgba(133,248,196,0.22)]'
                        : 'flex items-center gap-3 rounded-2xl px-3.5 py-3 text-on-surface-variant transition-colors hover:bg-surface-container'
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className="material-symbols-outlined"
                          style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                        >
                          {item.icon}
                        </span>
                        <span className="font-headline tracking-tight text-sm">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <div className="mt-auto px-3 pt-6">
          <div className="flex items-center justify-between p-3 rounded-2xl hover:bg-surface-container transition-colors">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isAdmin ? 'bg-primary-fixed text-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                {isAdmin ? 'A' : 'G'}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-on-surface truncate">{isAdmin ? 'Admin' : '访客'}</p>
                <p className="text-[10px] text-on-surface-variant">{isAdmin ? '管理员' : '只读模式'}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container/30 rounded-xl transition-colors"
              title={isAdmin ? '退出登录' : '退出访客模式'}
            >
              <span className="material-symbols-outlined text-sm">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Top Nav */}
      <header className="fixed top-0 right-0 z-40 flex w-[calc(100%-13rem)] items-center justify-between bg-surface/80 px-12 py-3 backdrop-blur-xl shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
        <div className="flex items-center gap-5">
          <span className="text-[10px] font-bold text-outline uppercase tracking-widest">行情</span>
          {(['BTC', 'ETH', 'SOL', 'BNB'] as const).map((sym, i) => {
            const price = spotPrices[sym];
            const ath = athData[sym]?.ath;
            const drawdown = price && ath ? ((1 - price / ath) * 100) : null;
            const athFull = ath
              ? `$${ath.toLocaleString(undefined, { maximumFractionDigits: ath >= 1000 ? 0 : 2 })}`
              : null;
            return (
              <div key={sym} className="flex items-center gap-4">
                {i > 0 && <span className="text-outline-variant/30 text-xs select-none">|</span>}
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-[16px] h-[16px] rounded-full flex items-center justify-center text-white font-bold leading-none shrink-0"
                    style={{ backgroundColor: COIN_COLORS[sym], fontSize: '8px' }}
                  >
                    {COIN_LABELS[sym]}
                  </span>
                  <span className="text-xs font-bold text-on-surface">{sym}</span>
                  <span className="text-xs font-mono-data text-on-surface">
                    {price
                      ? `$${price.toLocaleString(undefined, { maximumFractionDigits: sym === 'BTC' ? 0 : 2 })}`
                      : '—'}
                  </span>
                  {athFull && drawdown !== null && (
                    <span className="text-[10px] font-mono-data text-outline">
                      (ATH {athFull} <span className="text-error">-{drawdown.toFixed(1)}%</span>)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {spotPricesUpdatedAt && (
            <span className="flex items-center gap-1.5 text-xs text-outline/50 ml-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
              更新 {new Date(spotPricesUpdatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-6">
          {revenueOverview && (
            <>
              <div className="flex flex-col items-end">
                <span className="text-xs text-on-surface-variant font-medium uppercase tracking-widest">总净资产</span>
                <span className="font-headline text-primary font-bold">{totalValue}</span>
              </div>
              <div className="h-8 w-px bg-outline-variant/30" />
            </>
          )}
          <button className="relative p-2 hover:bg-surface-container rounded-full transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant">notifications</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="ml-52 px-12 pb-12 pt-24">
        <Outlet />
      </main>
    </div>
  );
}
