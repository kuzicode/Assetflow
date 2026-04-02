-- 快照（每周自动 or 手动触发）
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('auto', 'manual')),
  total_fair_value REAL NOT NULL,
  total_cash_value REAL NOT NULL,
  positions_json TEXT NOT NULL,
  prices_json TEXT NOT NULL
);

-- 周度/月度 P&L 记录
CREATE TABLE IF NOT EXISTS pnl_records (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL CHECK(period IN ('weekly', 'monthly')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  starting_capital REAL NOT NULL,
  ending_capital REAL NOT NULL,
  pnl REAL NOT NULL,
  return_rate REAL NOT NULL,
  days INTEGER NOT NULL,
  annualized_return REAL NOT NULL,
  is_adjusted INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'settled' CHECK(status IN ('in_progress', 'settled', 'locked')),
  auto_accumulate INTEGER NOT NULL DEFAULT 0,
  editable INTEGER NOT NULL DEFAULT 0,
  income_uniswap REAL NOT NULL DEFAULT 0,
  income_morpho REAL NOT NULL DEFAULT 0,
  income_hlp REAL NOT NULL DEFAULT 0,
  income_total REAL NOT NULL DEFAULT 0,
  last_uniswap_value REAL NOT NULL DEFAULT 0,
  last_morpho_value REAL NOT NULL DEFAULT 0,
  last_hlp_value REAL NOT NULL DEFAULT 0,
  last_auto_update_at TEXT,
  base_pnl REAL NOT NULL DEFAULT 0
);

-- 收益总览（手动初始化，后续自动更新）
CREATE TABLE IF NOT EXISTS revenue_overview (
  id TEXT PRIMARY KEY,
  period_label TEXT NOT NULL,
  start_date TEXT NOT NULL,
  initial_investment REAL NOT NULL,
  fair_value REAL NOT NULL,
  cash_value REAL NOT NULL,
  profit REAL NOT NULL,
  return_rate REAL NOT NULL,
  running_days INTEGER NOT NULL,
  annualized_return REAL NOT NULL
);

-- 手动资产（CEX 余额等）
CREATE TABLE IF NOT EXISTS manual_assets (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  base_token TEXT NOT NULL,
  amount REAL NOT NULL,
  source TEXT DEFAULT 'cex_manual',
  platform TEXT DEFAULT '',
  updated_at TEXT NOT NULL
);

-- 钱包地址配置
CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  address TEXT NOT NULL,
  chains_json TEXT NOT NULL
);

-- 设置
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

-- 默认设置
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('settlement_day', '4'),
  ('auto_snapshot', 'true'),
  ('base_currency', 'USDT');

CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_pnl_period_date ON pnl_records(period, start_date);
