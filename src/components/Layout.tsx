import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';

const navItems = [
  { to: '/',          label: '收益总览',     icon: 'dashboard' },
  { to: '/positions', label: '资金数据',     icon: 'account_balance_wallet' },
  { to: '/wallets',   label: '钱包管理',     icon: 'account_balance' },
  { to: '/settings',  label: '结算设置',     icon: 'settings_suggest' },
  { to: '/account',   label: '账户管理',     icon: 'manage_accounts' },
];

export default function Layout() {
  const navigate = useNavigate();
  const { revenueOverview, authMode, setAuthMode } = useStore();

  const handleLogout = () => {
    setAuthMode(null);
    navigate('/login', { replace: true });
  };

  const isAdmin = authMode === 'admin';

  const totalValue = revenueOverview
    ? `$${revenueOverview.fairValue.toLocaleString()}`
    : '—';

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      {/* Sidebar */}
      <aside className="h-screen w-56 fixed left-0 top-0 bg-surface-container-low flex flex-col py-8 z-50">
        <div className="px-6 mb-10">
          <h1 className="text-xl font-bold text-primary font-headline tracking-tight">Assetflow</h1>
          <p className="text-xs text-on-surface-variant/60 font-medium mt-1">加密资产管理系统</p>
        </div>

        <nav className="flex-1 space-y-1 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                isActive
                  ? 'bg-primary-fixed text-primary font-bold rounded-xl px-4 py-3 flex items-center gap-3 transition-all duration-200'
                  : 'text-on-surface-variant px-4 py-3 hover:bg-surface-container transition-colors rounded-xl flex items-center gap-3'
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
        </nav>

        <div className="px-4 mt-auto pt-6">
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
      <header className="fixed top-0 right-0 w-[calc(100%-14rem)] z-40 bg-surface/80 backdrop-blur-xl flex justify-between items-center px-12 py-4 shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
        <div className="flex items-center gap-2">
          <span className="text-sm text-on-surface-variant font-medium">by Trusme AI Lab</span>
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
      <main className="ml-56 pt-24 px-12 pb-12">
        <Outlet />
      </main>
    </div>
  );
}
