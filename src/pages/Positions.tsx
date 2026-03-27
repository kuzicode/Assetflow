import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { BASE_TOKENS, TOKEN_DISPLAY_NAMES } from '../config/chains';

const TOKEN_LOGOS: Record<string, string> = {
  STABLE: 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons/svg/color/usdt.svg',
  ETH:    'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons/svg/color/eth.svg',
  BTC:    'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons/svg/color/btc.svg',
  BNB:    'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons/svg/color/bnb.svg',
};

const TOKEN_BG: Record<string, string> = {
  STABLE: 'bg-surface-container-lowest',
  ETH: 'bg-surface-container-low',
  BTC: 'bg-surface-container-lowest',
  BNB: 'bg-surface-container-low',
};

// 各币种小数位数
const TOKEN_DECIMALS: Record<string, number> = {
  STABLE: 0,
  ETH: 2,
  BTC: 3,
  BNB: 2,
};

function formatAmount(amount: number, token: string) {
  const decimals = TOKEN_DECIMALS[token] ?? 2;
  return Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function groupBySource(subPositions: any[]) {
  const groups: Record<string, any[]> = {
    wallet: [],
    lp: [],
    lp_fees: [],
    lending: [],
    hlp: [],
    cex_manual: [],
  };
  for (const sub of subPositions) {
    const key = sub.source || 'wallet';
    if (groups[key]) groups[key].push(sub);
    else groups.wallet.push(sub);
  }
  return groups;
}

const SOURCE_LABELS: Record<string, string> = {
  wallet: '钱包余额',
  lp: 'Uniswap LP 仓位',
  lp_fees: 'LP 手续费',
  lending: 'Morpho 借贷仓位',
  hlp: 'Hyperliquid HLP',
  cex_manual: 'CEX 手动录入',
};

export default function Positions() {
  const navigate = useNavigate();
  const { positions, manualAssets, revenueOverview, prices, positionsUpdatedAt, loading, authMode, loadPositions, fetchPositions, fetchManualAssets, fetchRevenueOverview } = useStore();
  const isAdmin = authMode === 'admin';

  useEffect(() => {
    loadPositions();
    fetchManualAssets();
    fetchRevenueOverview();
  }, []);

  const manualByToken: Record<string, typeof manualAssets> = {};
  for (const asset of manualAssets) {
    const token = asset.baseToken;
    if (!manualByToken[token]) manualByToken[token] = [];
    manualByToken[token].push(asset);
  }

  // 计算总资产（USDT折算）
  const onChainUsd = positions.reduce((s, p) => s + p.totalUsdValue, 0);
  const manualUsd = manualAssets.reduce((s, asset) => {
    const price = asset.baseToken === 'STABLE' ? 1 : (prices[asset.baseToken] || 0);
    return s + asset.amount * price;
  }, 0);
  const totalUsd = onChainUsd + manualUsd;

  const refreshedTimeLabel = positionsUpdatedAt
    ? new Date(positionsUpdatedAt).toLocaleTimeString('zh-CN', { hour12: false })
    : '未刷新';

  return (
    <div className="space-y-12">
      {/* Header */}
      <section>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h2 className="text-on-surface-variant font-medium text-sm mb-2">资产总额</h2>
            {(positions.length > 0 || manualAssets.length > 0) ? (
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-bold font-headline tracking-tight text-on-surface">
                  {Math.round(totalUsd).toLocaleString()}
                </span>
                <span className="text-2xl font-semibold text-on-surface-variant"> ~USDT</span>
                {revenueOverview && revenueOverview.returnRate !== 0 && (
                  <span className={`font-bold text-lg ${revenueOverview.returnRate >= 0 ? 'text-primary' : 'text-tertiary'}`}>
                    {revenueOverview.returnRate >= 0 ? '+' : ''}{(revenueOverview.returnRate * 100).toFixed(2)}%
                  </span>
                )}
              </div>
            ) : (
              <div className="text-5xl font-bold font-headline tracking-tight text-on-surface-variant/40">
                暂无数据
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-on-surface-variant">
              本日刷新时间：<span className="font-mono-data">{refreshedTimeLabel}</span>
            </span>
            <button
              onClick={() => { fetchPositions(); fetchManualAssets(); fetchRevenueOverview(); }}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-2xl text-sm font-bold hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-60"
            >
              <span
                className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {loading ? 'sync' : 'refresh'}
              </span>
              {loading ? '获取中...' : '刷新数据'}
            </button>
            {isAdmin && (
              <button
                onClick={() => navigate('/wallets')}
                className="flex items-center gap-2 px-5 py-3 bg-surface-container-lowest rounded-2xl text-sm font-bold text-primary hover:bg-primary-fixed/30 transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">add_circle</span>
                添加钱包 / 手动资产
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Position Grid */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {BASE_TOKENS.map((token) => {
          const pos = positions.find((p) => p.baseToken === token);
          const manual = manualByToken[token] || [];
          const groups = pos ? groupBySource(pos.subPositions) : null;

          return (
            <div
              key={token}
              className={`${TOKEN_BG[token]} rounded-[2rem] p-8 transition-transform hover:-translate-y-1 duration-300`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <img
                    src={TOKEN_LOGOS[token]}
                    alt={token}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-lg font-bold font-headline">{TOKEN_DISPLAY_NAMES[token] || token}</h3>
                    <span className="text-xs font-mono-data text-on-surface-variant">
                      {token === 'STABLE'
                        ? 'USDT'
                        : `~$${(prices[token] || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card total — first row below header */}
              {pos ? (
                <p className="text-3xl font-bold font-mono-data">
                  {formatAmount(pos.totalAmount, token)}
                </p>
              ) : (
                <p className="text-3xl font-bold font-mono-data text-on-surface-variant/30">
                  {formatAmount(0, token)}
                </p>
              )}

              {/* Only render breakdown if there's actual data */}
              {(pos && pos.totalAmount > 0 || manual.length > 0) && (
                <div className="space-y-6 mt-6 pt-5 border-t border-outline-variant/20">
                  {groups && Object.entries(groups).map(([source, items]) => {
                    if (items.length === 0 && source !== 'cex_manual') return null;
                    if (source === 'cex_manual') return null;
                    const total = items.reduce((s, i) => s + i.amount, 0);
                    const isLoss = source === 'lending' && total < 0;
                    return (
                      <div key={source}>
                        <p className="text-xs text-on-surface-variant mb-1">{SOURCE_LABELS[source]}</p>
                        <p className={`text-xl font-semibold font-mono-data ${
                          source === 'lp_fees' ? 'text-primary' :
                          isLoss ? 'text-tertiary' : ''
                        }`}>
                          {isLoss ? '- ' : ''}{formatAmount(total, token)}
                        </p>
                      </div>
                    );
                  })}

                  {manual.length > 0 && (
                    <div className="pt-4 border-t border-dashed border-outline-variant/30">
                      <p className="text-xs text-on-surface-variant mb-2">CEX 手动录入</p>
                      <div className="space-y-3">
                        {manual.map((asset) => (
                          <div key={asset.id}>
                            <p className="text-xs text-on-surface-variant">{asset.label}</p>
                            <p className="text-xl font-semibold font-mono-data">
                              {formatAmount(Number(asset.amount), token)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

    </div>
  );
}
