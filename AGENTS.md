---
last_updated: 2026-10-08
status: active
owner: KZ
harness_version: 6
---

# Assetflow (Hyperflow Defi) — Agent Guidelines

面向 DeFi 重度用户的个人加密投资组合仪表板：单用户、本地优先，聚合多链 DeFi（Uniswap V3 / Aave V3 / Morpho / Hyperliquid HLP）+ CEX 持仓，计算周 / 月 P&L，附 BTC 周期指标。

对外品牌为 **Hyperflow 的 Defi 产品线**（2026-07-13 起）：生产入口 `https://defi.hyperflow.one`（Cloudflare 灰云 → nginx TLS 反代 → 127.0.0.1:3001）。仓库名 / package 名 / localStorage key 仍用 assetflow，勿改（改 key 会登出所有端）。

技术栈：React 19 + Vite + Tailwind + Zustand + Recharts / lightweight-charts；Express 5 + ethers + node-cron + ccxt；纯 JSON 持久化。

## 快速导航

| 你想做什么 | 去哪里看 | 加载 |
|---|---|---|
| 当前迭代 / 活跃待办 | `docs/plan.md` | 常读 |
| 历史已完成 / 已废弃方案 | `docs/plan-archive.md` | 默认不读 |
| 详细架构（存储 / API / 定时任务 / 部署链路） | `docs/architecture.md` | 按需 |
| 完整数据模型 / P&L 推导 | `docs/DESIGN.md`（权威） | 按需 |
| 编码约定 / 代码健康阈值 | `docs/conventions.md` | 按需 |
| 踩坑记录（ISS-XXX） | `docs/issues.md` | 按需 |
| 已归档的历史 ISS | `docs/issues-archive.md` | 默认不读 |
| 产品视图（面向 PM） | `docs/pm-overview.md` | 按需 |
| 原始需求草稿 / UI 设计稿（历史参考） | `docs/reference/` | 默认不读 |

> 查 `issues.md` 先读头部索引表，再按 `## ISS-XXX` 定位单条，不整文件读。
> debug 线上数据问题：先 `ssh xw` 读 `server/data/*.json` 取证，再对照 `DESIGN.md` §10 P&L 推导。

## 硬性规则

### WF — 工作流

- **WF1** 跨文件、或无法一句话说清 diff 的改动 → 先更新 `docs/plan.md`（问题 / 方案 / 影响文件 / 验收）再动手
- **WF2** 完成门——宣称完成前依次做完：
  1. 跑能证明它的命令（见「常用命令」），回复里附命令与关键输出；没跑过就不算完成
  2. 精简本次 diff：重复块、死代码、无用参数/分支、可复用却新写的实现
  3. 解决了非平凡 bug → 追加 `docs/issues.md` 一条 ISS
  4. 本次改动 > 500 行 → 问用户有无经验值得记入 memory
- **WF3** 破坏性改动用 worktree 隔离，review 后再合并

### HM — Harness 维护

- **HM1** `docs/` 增删移文件，或项目定位变化 → 同一次改动内更新本文件的导航表 / 简介
- **HM2** 实质修改 docs 文件 → 更新其 frontmatter `last_updated`（`docs/` 被 gitignore，不能靠 git 历史）
- **HM3** 文档只写绝对日期 `YYYY-MM-DD`；不以仓库外路径作为权威内容，需要就摘要进仓
- **HM4** 问题状态的唯一权威是 `docs/issues.md`；`plan.md` 只链接 `ISS-XXX`，不复述状态
- **HM5** 本文件是唯一常载文件，≤ 150 行；领域规则组超过 6 条时细则下沉 `docs/conventions.md`

### CH — 代码健康

- **CH1** 先搜后写：新增函数 / 组件前先 grep 现有实现，能扩展就不复制；第三次出现才抽取
- **CH2** 重构单独提交 `refactor:`，不改行为；超出本次范围的重构记入 `plan.md` 的 `🔧 技术债` 行
- **CH3** 里程碑收尾做一次精简 pass，作为验收 checkbox；阈值见 `docs/conventions.md`「代码健康」

### DATA — 数据层（纯 JSON 持久化）

- **DATA1** 所有持久数据存 `server/data/*.json`，**无 SQLite**；`better-sqlite3` 已移除，勿重新引入
- **DATA2** JSON 写入必须原子（`.tmp` + `renameSync`），禁止直接覆写目标文件；手工修线上数据同理，且先备份为 `<file>.bak.<YYYYMMDD>_<tag>`
- **DATA3** 每个 repo 导出 `set<Name>DataDir(dir)`，测试用 `createTestDataDir()` 注入 tmpDir，禁止污染真实 `server/data/`
- **DATA4** API Keys（OKX / CoinGecko 等）不入 `settings.json`，统一走 `.env` → `process.env`

### PNL — P&L 计算

- **PNL1** `lastUniswapValue/lastMorphoValue/lastHlpValue` 是周期初基准，创建时写入、周期内不变；每日为**全量覆盖重算**（非累加）
- **PNL2** Uniswap / Morpho 低于基准归零（`max(0, …)`）；HLP 允许负数
- **PNL3** 创建周 / 月记录走 `fetchPositionsAggregate()` 直连；拉取失败则拒绝创建（防零基准 bug），勿降级到 safe fallback
- **PNL4** 前端周期归属：`pending` 用 `startDate`；`done` 月度用区间**中点**（`monthRefDate`，跨月延长结算如 0901-1008 → 9月），周度用 `endDate`。改归属逻辑须先对全部线上记录核对不翻转（ISS-003）

### DEPLOY — 部署

- **DEPLOY1** 生产服务器 SSH 别名 `xw`，路径 `/root/cook/Assetflow`
- **DEPLOY2** 不主动执行部署；按「常用命令」末尾流程提示用户手动执行（用户明确要求时可代为执行）
- **DEPLOY3** 服务器 `.env` 和 `server/data/*.json` 不进 git，部署时勿覆盖
- **DEPLOY4** `client/` 是入 git 的前端产物，服务器不跑 Vite build；改前端必须本地 build 并提交 `client/`

## 提交规范

前缀 `feat / fix / docs / refactor / chore / style` + 冒号 + 中文描述。

## 常用命令

```bash
make install            # 安装前后端依赖
make dev                # 后端 :3001 + 前端 :5173 并行
make test               # Vitest（仅后端）；单文件：cd server && npx vitest run src/routes/wallets.test.ts
make lint               # ESLint（仅前端；Dashboard.tsx 有存量 no-explicit-any，只看新增）
npx tsc -p tsconfig.app.json --noEmit   # 前端类型检查
make build              # 前端构建 → dist/ → client/，后端 tsc 编译

# 线上数据
bash scripts/pull-data.sh                # 同步服务器 server/data/*.json 到本地（先自动备份到 backups/）
bash scripts/pull-data.sh --backup-only  # 仅拉取到 backups/
ssh xw 'curl -s localhost:3001/api/pnl/monthly'   # 直接看线上周 / 月记录（weekly 同理）

# 生产部署（手动，按 DEPLOY 规则）：
npm run build && rm -rf client && cp -R dist client
git add <改动文件> client && git commit -m "..." && git push origin main
ssh xw 'cd /root/cook/Assetflow && git pull origin main && cd server && npm run build && cd .. && bash stop.sh && sleep 1 && bash start.sh'
ssh xw 'curl -s http://localhost:3001/api/health'
curl -s https://defi.hyperflow.one/ | grep -o 'index-[A-Za-z0-9_]*\.js'   # 确认公网 bundle 已更新
```
