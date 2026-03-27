# Assetflow 设计文档

**工程根目录为 `assetflow/`。本文档（`design/DESIGN.md`）为项目唯一维护的设计说明**，涵盖目录边界、架构、前后端、API、数据与部署。若与代码不一致，以代码为准并回写本文。

同目录下的 `stitch.md`、`frontend-design-brief.md`、需求草稿等仅作参考，不替代本文。

---

## 1. 工程边界与目录地图

| 路径 | 说明 |
|------|------|
| 工程根（`assetflow/`） | **主应用**：前后端源码、`Makefile`、`Dockerfile`、`docker-compose.yml`、SQLite 数据目录 `server/data/`。日常开发与部署均以此为工作区。 |
| `design/` | **设计文档目录**：本文为规范；其余文件可选。 |
| `.claude/` | 编辑器/Agent 本地配置（若存在），不参与运行时。 |

### 高层数据流（Mermaid）

```mermaid
flowchart TB
  subgraph browser [Browser]
    SPA[React SPA Vite]
  end
  subgraph assetflowServer [Express server]
    API[REST /api]
    DB[(SQLite WAL)]
  end
  subgraph external [External]
    RPC[EVM RPC]
    Prices[Price feeds e.g. Binance]
    HL[Hyperliquid REST]
  end
  SPA -->|HTTP dev: proxy /api| API
  SPA -->|HTTP prod: same origin| API
  API --> DB
  API --> RPC
  API --> Prices
  API --> HL
```

### 实现与运维注意

- **数据文件**：默认 SQLite 位于 `server/data/`（如 `assetflow.db`），备份与迁移需包含该目录。
- **本地生产静态资源**：Express 在 `NODE_ENV=production` 下从 `../../client` 相对 `server/dist` 提供前端；`make build` 会将 `dist/` 复制为 `client/`（见 [Makefile](../Makefile)）。仅运行 `npm run build` 时需自行执行 `rm -rf client && cp -R dist client`，详见 [README.md](../README.md)。
- **端口**：后端默认 `3001`；开发时 Vite 常见 `5173`，[vite.config.ts](../vite.config.ts) 将 `/api` 代理到后端。

---

## 2. 产品定位

Assetflow 是一个面向 DeFi 重度用户的个人加密货币投资组合管理仪表板。目标用户管理约 500 万 USDT 的组合，资产分布在多条链的 DeFi 协议（Uniswap、Aave、Morpho）和中心化交易所（CEX）中。核心功能是自动聚合所有链上持仓并计算每周/每月的 P&L（盈亏）。

**设计原则**

- 个人工具：无多用户、无鉴权、本地部署优先
- 数据准确优先：公允价值（LP 按本金计）vs 现金价值（计入无常损失）双口径
- 实时链上查询 + 本地持久化快照，数据不依赖第三方托管

---

## 3. 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19 | UI 框架 |
| React Router | 7 | 客户端路由 |
| Vite | 8 | 构建工具 |
| TailwindCSS | 4 | 样式系统 |
| Zustand | 5 | 全局状态管理 |
| Recharts | 3 | 图表组件 |
| TypeScript | 5.9 | 类型安全 |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 22 | 运行时 |
| Express | 5 | HTTP 框架 |
| better-sqlite3 | 12 | 本地数据库 |
| ethers.js | 6 | EVM 链交互 |
| ccxt | 4.5 | 价格数据（Binance） |
| node-cron | 4 | 定时任务 |
| TypeScript | 6 | 类型安全 |
| Vitest | 4 | 单元/集成测试 |

### 基础设施

- **数据库**：SQLite（WAL 模式），文件位于 `server/data/assetflow.db`
- **容器化**：Docker 多阶段构建 + Docker Compose
- **构建**：Makefile 统一前后端构建/测试/部署命令

---

## 4. 系统架构

```
┌─────────────────────────────────────────────────────┐
│                    Browser (1440px+)                 │
│  ┌─────────────────────────────────────────────────┐ │
│  │  React App (Vite SPA)                           │ │
│  │  ├── Dashboard  (P&L 分析、收益总览)             │ │
│  │  ├── Positions  (持仓明细)                       │ │
│  │  └── Settings   (钱包配置、参数设置)             │ │
│  └──────────────────┬──────────────────────────────┘ │
└─────────────────────│───────────────────────────────┘
                      │ HTTP /api/*
┌─────────────────────▼───────────────────────────────┐
│         Express Server (port 3001)                   │
│  ┌──────────────────────────────────────────────┐   │
│  │  REST API Routes                             │   │
│  │  /api/wallets   /api/positions               │   │
│  │  /api/pnl       /api/snapshots               │   │
│  │  /api/prices    /api/settings                │   │
│  └──────────┬────────────────────┬─────────────┘   │
│             │                    │                   │
│  ┌──────────▼──────────┐  ┌──────▼──────────────┐  │
│  │  SQLite Database     │  │  External Calls      │  │
│  │  (better-sqlite3)    │  │  ├── EVM RPC 节点    │  │
│  │  ├── wallets         │  │  │   (公共端点)       │  │
│  │  ├── snapshots       │  │  ├── Binance API     │  │
│  │  ├── pnl_records     │  │  │   (ccxt)          │  │
│  │  ├── revenue_overview│  │  └── Hyperliquid API │  │
│  │  ├── manual_assets   │  └─────────────────────┘  │
│  │  └── settings        │                            │
│  └─────────────────────┘                            │
└─────────────────────────────────────────────────────┘
```

### 开发模式

- 前端 Vite dev server（port 5173）将 `/api/*` 请求代理到后端 port 3001
- 前后端独立热重载，互不干扰

### 生产模式

- 后端同时提供 API 与前端静态资源（工程根目录下的 `client/`，由构建步骤从 `dist/` 生成）
- 单进程单端口；Docker 容器内运行见 [Dockerfile](../Dockerfile)

---

## 5. 前端设计

### 页面结构

```
App
├── Layout（固定侧边栏 + 主内容区）
│   ├── Dashboard
│   │   ├── RevenueOverviewCard（收益总览卡片）
│   │   ├── AssetDistributionChart（资产分布饼图）
│   │   ├── MonthlyPnlTable（月度 P&L 表格）
│   │   ├── WeeklyPnlTable（周度 P&L 表格）
│   │   └── PnlCalendarHeatmap（P&L 日历热力图）
│   ├── Positions
│   │   ├── SummaryBar（总价值 + 实时价格）
│   │   ├── PositionGrid（4 列卡片：STABLE / ETH / BTC / BNB）
│   │   └── ManualAssetForm（手动资产录入）
│   └── Settings
│       ├── WalletManagement（钱包列表 + 添加表单）
│       └── GeneralSettings（结算日、自动快照等）
└── [路由: / | /positions | /settings]
```

### 状态管理（Zustand Store）

所有 API 数据集中在单一 store `useStore.ts`：

```typescript
interface AppStore {
  // 数据
  positions: TokenPosition[];
  weeklyPnl: PnlRecord[];
  monthlyPnl: PnlRecord[];
  revenueOverview: RevenueOverview | null;
  manualAssets: ManualAsset[];
  wallets: Wallet[];
  settings: AppSettings;

  // 状态
  loading: boolean;
  error: string | null;

  // Actions
  fetchPositions(): Promise<void>;
  fetchWeeklyPnl(): Promise<void>;
  fetchMonthlyPnl(): Promise<void>;
  fetchRevenueOverview(): Promise<void>;
  fetchManualAssets(): Promise<void>;
  fetchWallets(): Promise<void>;
  fetchSettings(): Promise<void>;
}
```

### 核心数据类型

```typescript
// 子持仓（最小粒度）
interface SubPosition {
  id: string;
  label: string;                   // 例: "主钱包-ETH/USDC-仓位"
  source: 'wallet' | 'lp' | 'lp_fees' | 'lending' | 'cex_manual';
  protocol?: string;               // Uniswap V3 / Aave V3 / Morpho...
  chain?: string;                  // ethereum / arbitrum / base...
  amount: number;
  usdValue: number;
}

// 按基础资产分组
interface TokenPosition {
  baseToken: 'STABLE' | 'ETH' | 'BTC' | 'BNB' | string;
  subPositions: SubPosition[];
  totalAmount: number;
  totalUsdValue: number;
}

// P&L 记录（周度或月度）
interface PnlRecord {
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
}
```

---

## 6. 后端设计

### 目录结构

```
server/src/
├── index.ts          # 入口：启动 HTTP 服务器
├── app.ts            # Express 应用配置（路由注册 + 生产静态服务）
├── db/
│   ├── index.ts      # SQLite 连接单例，WAL 模式
│   └── schema.sql    # 建表 DDL + 默认数据
├── config/
│   ├── chains.ts     # RPC 端点、链 ID、代币定义、分组逻辑
│   └── defi.ts       # DeFi 协议合约地址（Uniswap/Aave/Morpho）
├── routes/
│   ├── wallets.ts    # 钱包 CRUD
│   ├── positions.ts  # 持仓聚合（核心路由）
│   ├── snapshots.ts  # 快照存取
│   ├── pnl.ts        # P&L 计算与管理
│   ├── prices.ts     # 价格查询
│   └── settings.ts   # 设置 CRUD
├── defi/
│   ├── evmBalance.ts      # EVM 原生 + ERC20 余额
│   ├── uniswapV3.ts       # Uniswap V3 LP 持仓 + 手续费
│   ├── aaveV3.ts          # Aave V3 存款/借款
│   ├── morphoBlue.ts      # Morpho Blue 市场持仓
│   ├── morphoVault.ts     # Morpho Vault (ERC-4626) 持仓
│   └── hyperliquidHlp.ts  # Hyperliquid HLP Vault（REST API）
└── utils/
    └── price.ts      # Binance 价格获取 + 稳定币处理
```

### API 端点总览

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/wallets` | 获取所有钱包 |
| POST | `/api/wallets` | 添加钱包 |
| DELETE | `/api/wallets/:id` | 删除钱包 |
| POST | `/api/positions/fetch` | 聚合所有持仓（链上查询） |
| GET | `/api/positions/manual` | 获取手动资产 |
| POST | `/api/positions/manual` | 添加/更新手动资产 |
| DELETE | `/api/positions/manual/:id` | 删除手动资产 |
| POST | `/api/snapshots` | 创建快照 |
| GET | `/api/snapshots` | 查询快照（支持日期过滤） |
| GET | `/api/pnl/weekly` | 周度 P&L 记录 |
| GET | `/api/pnl/monthly` | 月度 P&L 记录 |
| POST | `/api/pnl/calculate` | 从最新两个快照计算 P&L |
| PUT | `/api/pnl/:id` | 手动修正 P&L 记录 |
| GET | `/api/pnl/revenue` | 获取收益总览 |
| PUT | `/api/pnl/revenue` | 更新收益总览 |
| GET | `/api/prices` | 查询代币价格（`?symbols=ETH,BTC`） |
| GET | `/api/settings` | 获取所有设置 |
| PUT | `/api/settings` | 更新设置 |

---

## 7. 持仓聚合流程（核心业务逻辑）

`POST /api/positions/fetch` 是系统最核心的端点，执行以下步骤：

```
1. 读取 DB 中所有已配置钱包

2. 并行获取每个钱包的链上数据：
   ├── EVM 余额（原生代币 + ERC20）
   ├── Uniswap V3 LP 持仓 + 未收取手续费
   ├── Aave V3 存款/借款余额
   ├── Morpho Blue 市场持仓
   ├── Morpho Vault (ERC-4626) 份额
   └── Hyperliquid HLP Vault 权益（REST API）

3. 从 settings 表读取 Morpho 市场 ID 和 Vault 地址

4. 汇总所有代币符号 → 一次性调用 Binance 获取价格
   └── 稳定币直接返回 $1，不发请求

5. 按基础资产分组：
   STABLE（USDT/USDC/DAI...）/ ETH（ETH/WETH/stETH...）
   BTC（BTC/WBTC/cbBTC...）/ BNB（BNB/WBNB）/ 其他

6. 读取手动资产（CEX 余额等），合并到对应分组

7. 返回 TokenPosition[] + prices + timestamp
```

### 单链协议查询方式

| 协议 | 查询方式 | 说明 |
|------|---------|------|
| EVM Balance | `provider.getBalance()` + `contract.balanceOf()` | 原生代币 + 硬编码 ERC20 列表 |
| Uniswap V3 | NFT Position Manager + Factory + Pool slot0 | 用 V3 数学公式计算持仓量 |
| Aave V3 | UI Pool Data Provider | 含缩放后的 aToken 换算 |
| Morpho Blue | `morpho.position()` + `morpho.market()` | shares → assets 换算 |
| Morpho Vault | ERC-4626 `balanceOf` + `convertToAssets` | 份额换算为底层资产 |
| Hyperliquid | REST POST `api.hyperliquid.xyz/info` | 获取 HLP Vault 权益 |

---

## 8. Uniswap V3 数学模型

Uniswap V3 LP 的持仓量计算基于流动性、Tick 范围和当前价格：

```typescript
// Tick → sqrtPrice（精度 Q96）
tickToSqrtPriceX96(tick) = sqrt(1.0001^tick) * 2^96

// 根据价格区间计算持仓量
if (currentPrice <= lowerBound):
    amount0 = liquidity * Q96 * (sqrtB - sqrtA) / (sqrtA * sqrtB)  // 全为 token0
    amount1 = 0

if (currentPrice >= upperBound):
    amount0 = 0
    amount1 = liquidity * (sqrtB - sqrtA) / Q96                    // 全为 token1

if (lowerBound < currentPrice < upperBound):
    amount0 = liquidity * Q96 * (sqrtB - sqrtPrice) / (sqrtPrice * sqrtB)
    amount1 = liquidity * (sqrtPrice - sqrtA) / Q96                // 双 token
```

这是系统中最精密的纯逻辑，已有独立单元测试覆盖。

---

## 9. P&L 计算模型

系统支持两种价值口径：

| 口径 | 含义 | 计算方式 |
|------|------|---------|
| **公允价值（Fair Value）** | 以投入本金估算 LP 价值 | LP 以原始投入金额计算，忽略无常损失 |
| **现金价值（Cash Value）** | 实际可变现金额 | LP 按当前市场价格计算，反映无常损失 |

**P&L 公式**：

```
pnl = endingCapital - startingCapital
returnRate = pnl / startingCapital
annualizedReturn = returnRate / days * 365
```

**快照机制**：

- 每次触发快照，记录当前所有持仓数据和价格到 `snapshots` 表
- P&L 计算从最近两个快照提取 `total_fair_value` 差值
- 支持手动修正（`is_adjusted` 标记）

---

## 10. 数据库设计

```sql
-- 钱包（多链地址）
wallets (id, label, address, chains_json)

-- 时间序列快照（持仓 + 价格 JSON）
snapshots (id, timestamp, type, total_fair_value, total_cash_value, positions_json, prices_json)
INDEX ON (timestamp)

-- P&L 记录（周度/月度）
pnl_records (id, period, start_date, end_date, starting_capital, ending_capital,
             pnl, return_rate, days, annualized_return, is_adjusted)
INDEX ON (period, start_date)

-- 收益总览（单行，手动维护）
revenue_overview (id, period_label, start_date, initial_investment, fair_value,
                  cash_value, profit, return_rate, running_days, annualized_return)

-- 手动资产（CEX 余额等）
manual_assets (id, label, base_token, amount, source, updated_at)

-- 配置项（KV 表）
settings (key, value)
-- 内置 key：settlement_day, auto_snapshot, base_currency
-- 可扩展：morpho_market_ids, morpho_vault_addresses
```

---

## 11. 测试策略

### 分层测试

| 层次 | 覆盖范围 | 工具 |
|------|---------|------|
| 纯逻辑单元测试 | Uniswap V3 数学、Token 分组逻辑 | Vitest |
| DB 集成测试 | CRUD 路由（内存 SQLite） | Vitest + supertest |
| DeFi 集成测试 | 链上查询（真实 RPC） | `test-defi.ts` 手动脚本 |

### 测试文件

```
server/src/
├── defi/uniswapV3.test.ts     # V3 数学函数（7 个测试）
├── config/chains.test.ts      # Token 分组映射（5 个测试）
├── routes/wallets.test.ts     # 钱包 CRUD（7 个测试）
├── routes/pnl.test.ts         # P&L 计算与调整（10 个测试）
└── routes/settings.test.ts    # 设置 CRUD（4 个测试）
```

总计 **36 个自动化测试**，运行时间 < 500ms（使用内存 SQLite，无外部依赖）。

### DB Mock 策略

路由测试通过 `vi.mock('../db/index.js')` 替换生产数据库为内存实例：

```typescript
const testDb = createTestDb();          // 内存 SQLite + 完整 schema
vi.mock('../db/index.js', () => ({ default: testDb }));
```

---

## 12. 支持的链和协议

### 区块链网络

| 链 | 链 ID | 支持协议 |
|---|------|---------|
| Ethereum | 1 | EVM Balance, Uniswap V3, Aave V3, Morpho |
| Arbitrum | 42161 | EVM Balance, Uniswap V3, Aave V3 |
| Optimism | 10 | EVM Balance, Uniswap V3, Aave V3 |
| Base | 8453 | EVM Balance, Uniswap V3, Aave V3, Morpho |
| Polygon | 137 | EVM Balance, Uniswap V3, Aave V3 |
| BSC | 56 | EVM Balance |
| Avalanche | 43114 | EVM Balance, Aave V3 |

RPC 端点使用公共节点（llamarpc、arbitrum.io 等），无需配置 API Key。

### DeFi 协议合约地址

| 协议 | 合约类型 | 地址 |
|------|---------|------|
| Uniswap V3 | Position Manager (ETH/ARB/OP/POLY) | `0xC36442b4...` |
| Uniswap V3 | Position Manager (Base) | `0x03a520b3...` |
| Uniswap V3 | Factory (ETH/ARB/OP/POLY) | `0x1F98431c...` |
| Morpho Blue | Core (ETH + Base) | `0xBBBBBbbB...` |

---

## 13. 部署架构

### 开发模式

```
Terminal 1: cd server && npm run dev   # port 3001
Terminal 2: npm run dev                # port 5173, proxies /api to 3001
```

### 生产模式（本地）

```bash
make build   # 构建前后端，并生成 client/
make start   # NODE_ENV=production，单进程服务 API + 静态文件
```

### Docker 模式

```
┌──────────────────────────────────────────┐
│  Docker Container                         │
│  ├── Node.js process (port 3001)          │
│  │   ├── Express API  (/api/*)            │
│  │   └── Static files (frontend client/)  │
│  └── Volume: /app/server/data (SQLite)    │
└──────────────────────────────────────────┘
       ↑ port 3001
  Host Machine
```

多阶段 Dockerfile：

1. **Stage 1**：Node.js + npm → 构建前端 (`dist/`)
2. **Stage 2**：Node.js + build tools → 编译后端 TypeScript
3. **Stage 3**：精简运行时，仅含编译产物和生产依赖

SQLite 数据文件通过 Docker volume 持久化，容器重建不丢数据。

---

## 相关链接

- [README.md](../README.md) — 安装、开发、生产与 Docker 运行步骤
