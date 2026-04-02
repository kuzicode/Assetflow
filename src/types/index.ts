// --- 子仓位 ---
export interface SubPosition {
  id: string;
  label: string;
  source: 'wallet' | 'lp' | 'lp_fees' | 'lending' | 'hlp' | 'cex_manual';
  protocol?: string;
  chain?: string;
  amount: number;
  usdValue: number;
  metadata?: Record<string, any>;
}

// --- 按 token 分组的仓位 ---
// baseToken: 'STABLE' (USDT/USDC/DAI etc.) | 'ETH' | 'BTC' | 'BNB'
export interface TokenPosition {
  baseToken: string;
  subPositions: SubPosition[];
  totalAmount: number;
  totalUsdValue: number;
}

// --- 快照 ---
export interface PortfolioSnapshot {
  id: string;
  timestamp: string;
  type: 'auto' | 'manual';
  totalFairValue: number;
  totalCashValue: number;
  positions: TokenPosition[];
  prices: Record<string, number>;
}

// --- P&L 记录 ---
export interface PnlRecord {
  id: string;
  period: 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  startingCapital: number;
  endingCapital: number;
  pnl: number;
  returnRate: number;
  days: number;
  annualizedReturn: number;
  isAdjusted: boolean;
  status?: 'in_progress' | 'settled' | 'locked';
  autoAccumulate?: boolean;
  editable?: boolean;
  incomeUniswap?: number;
  incomeMorpho?: number;
  incomeHlp?: number;
  incomeTotal?: number;
  lastAutoUpdateAt?: string | null;
  /** 月度专用：已结算周累计入袋的 pnl（API `basePnl`） */
  basePnl?: number;
}

// --- 收益总览 ---
export interface RevenueOverview {
  id: string;
  periodLabel: string;
  startDate: string;
  initialInvestment: number;
  fairValue: number;
  cashValue: number;
  profit: number;
  returnRate: number;
  runningDays: number;
  annualizedReturn: number;
}

// --- 手动资产 ---
export interface ManualAsset {
  id: string;
  label: string;
  baseToken: string;
  amount: number;
  source: string;
  platform: string;
  updatedAt: string;
}

// --- 钱包 ---
export interface Wallet {
  id: string;
  label: string;
  address: string;
  chains: string[];
}

// --- 理财利率 ---
export interface YieldsData {
  aave_usdc: { apy: number | null; chain: string };
  morpho_usdc: { apy: number | null; chain: string; vault: string };
  hlp: { apy: number | null };
  updatedAt?: string;
}

// --- 设置 ---
export interface AppSettings {
  settlement_day: string;
  auto_snapshot: string;
  base_currency: string;
}
