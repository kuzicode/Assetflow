# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (both frontend + backend)
make install

# Development (runs backend on :3001 and frontend on :5173 in parallel)
make dev
make dev-server   # backend only
make dev-client   # frontend only

# Build for production
make build        # frontend build → dist/ → client/, backend tsc compile

# Run tests (Vitest, backend only)
make test
make test-watch

# Lint (ESLint, frontend only)
make lint

# Start production server
make start        # NODE_ENV=production node server/dist/index.js

# Docker
docker compose up -d --build
docker compose logs -f
```

To run a single test file:
```bash
cd server && npx vitest run src/routes/wallets.test.ts
```

## Architecture

This is a **personal DeFi portfolio dashboard** — single-user, local-first. Simple password auth via `ADMIN_PASSWORD` env var (default: `Admin`), checked at `POST /api/auth/login`.

```
Browser (React SPA)
    ↓ /api/* (dev: Vite proxy → :3001, prod: same origin)
Express Server (:3001)
    ├── REST API (src/routes/)
    ├── SQLite (better-sqlite3, WAL mode) at server/data/assetflow.db
    └── External: EVM RPC (public nodes), Binance via ccxt, Hyperliquid REST, DeBank Pro API, OKX Web3 API
```

**Frontend** (`src/`): React 19 + TypeScript + Vite + TailwindCSS + Recharts. State via Zustand (`src/store/useStore.ts`). Three pages: Dashboard, Positions, Settings.

**Backend** (`server/src/`): Express 5 + TypeScript. Key layers:
- `routes/` — REST endpoints (auth, wallets, positions, snapshots, pnl, prices, settings)
- `defi/` — On-chain/off-chain data fetchers: `evmBalance.ts`, `uniswapV3.ts`, `aaveV3.ts`, `morphoBlue.ts`, `morphoVault.ts`, `hyperliquidHlp.ts`, `debank.ts`, `okx.ts`
- `db/` — SQLite setup and schema
- `config/chains.ts` — RPC endpoints and chain metadata
- `config/defi.ts` — Protocol contract addresses

**Dual valuation model**: Positions have both "Fair Value" (mark-to-market) and "Cash Value" (liquidation value). P&L snapshots are stored in SQLite for weekly/monthly heatmap calculations.

**Supported chains**: Ethereum, Arbitrum, Optimism, Base, Polygon, BSC, Avalanche
**Supported protocols**: Uniswap V3, Aave V3, Morpho Blue, Morpho Vault, Hyperliquid HLP, DeBank (aggregated), OKX Web3

**Production build**: frontend compiles to `dist/`, then copied to `client/`, which Express serves as static files. No separate frontend server in production.

## P&L Calculation Logic

### Weekly auto-accumulate (`runDailyPnlAutoAccumulate`)
Runs at UTC 00:00 daily (+ once on server startup). For each `in_progress + auto_accumulate=1` weekly record:

```
pnl = max(0, current_morpho  - last_morpho_value)   ← Morpho position total value
    + max(0, current_hlp     - last_hlp_value)       ← HLP equity
    + max(0, current_uniswap - last_uniswap_value)   ← Uniswap V3 unclaimed fees (USD)
```

**Key design**: `last_uniswap/morpho/hlp_value` are the **week-start baselines** set once when the weekly record is created — they do NOT update daily. Each day's pnl is a full recompute from week start (overwrite, not accumulate). If any value drops below baseline (e.g. fees claimed, HLP down), that component contributes 0.

### Monthly sync (`syncMonthlyInProgressFromWeekly`)
- `base_pnl` (DB column): locked sum of all settled weeks — only updated via `bakeWeeklyPnlIntoMonthly()` when a weekly record settles
- Monthly `pnl` = `base_pnl` + current in-progress weekly `pnl`
- `end_date` advances to match the latest weekly `end_date`

### Income breakdown (`buildIncomeBreakdown` in `positions.ts`)
- `uniswap`: sub-positions with `source='lp_fees'` — Uniswap V3 unclaimed fees fetched via `collect.staticCall` (reads pool-accrued fees, not just `tokensOwed`)
- `morpho`: all sub-positions with protocol containing "morpho" (total position value)
- `hlp`: sub-positions with `source='hlp'` (Hyperliquid HLP equity)

In the **OKX path**, Uniswap fees are fetched separately via direct RPC (`fetchUniswapV3Positions`) since OKX API bundles fees+principal. HLP is also fetched separately via Hyperliquid REST.

### Creating weekly/monthly records
`POST /api/pnl/weekly` and `POST /api/pnl/monthly` call `fetchPositionsAggregate()` directly (not the safe fallback) to set the week-start baselines. If the positions fetch fails, the record creation is rejected with 500 — prevents silent zero-baseline bugs.

## RPC Configuration

Public nodes are in `server/src/config/chains.ts` (`EVM_RPCS`). Per-chain fallbacks via env vars:

| Env var | Chain | Default fallback |
|---------|-------|-----------------|
| `ETH_RPC_FALLBACK` | ethereum | Alchemy |

When a fallback is set, `createProvider()` returns an ethers.js `FallbackProvider` (primary stalls >2s → auto-switch to fallback).

## Wallet Address Explorer Links

In `WalletManagement.tsx`, `getAddressUrl(address, chains)` maps addresses to block explorers:
- `chains.includes('bitcoin')` → mempool.space
- `chains.includes('solana')` → jup.ag/portfolio
- `0x...` (42 chars) → debank.com/profile
- Other formats → non-clickable

## Daily Auto-Snapshot

`runAutoSnapshot()` in `server/src/routes/snapshots.ts` runs daily at UTC+8 08:00 (+ startup catch-up). It calls `fetchPositionsAggregate()`, computes total USD value, and inserts into `snapshots` table (type=`auto`). Idempotent per UTC+8 date. Two consecutive snapshots' `total_fair_value` difference = daily return.

## Settings (UI-only, not yet wired)

`settlement_day` and `auto_snapshot` are stored in the `settings` table and displayed in Settings page but **not used by any backend logic**. Auto-settlement is manual for now.

## Design Document

The primary architecture reference is `design/DESIGN.md` — read it for data model details, P&L calculation logic, and protocol integration specifics.
