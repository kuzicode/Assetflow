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

This is a **personal DeFi portfolio dashboard** — no authentication, single-user, local-first.

```
Browser (React SPA)
    ↓ /api/* (dev: Vite proxy → :3001, prod: same origin)
Express Server (:3001)
    ├── REST API (src/routes/)
    ├── SQLite (better-sqlite3, WAL mode) at server/data/assetflow.db
    └── External: EVM RPC (public nodes), Binance via ccxt, Hyperliquid REST
```

**Frontend** (`src/`): React 19 + TypeScript + Vite + TailwindCSS + Recharts. State via Zustand (`src/store/useStore.ts`). Three pages: Dashboard, Positions, Settings.

**Backend** (`server/src/`): Express 5 + TypeScript. Key layers:
- `routes/` — REST endpoints (wallets, positions, snapshots, pnl, prices, settings)
- `defi/` — On-chain data fetchers per protocol: `evmBalance.ts`, `uniswapV3.ts`, `aaveV3.ts`, `morphoBlue.ts`, `morphoVault.ts`, `hyperliquidHlp.ts`
- `db/` — SQLite setup and schema
- `config/chains.ts` — RPC endpoints and chain metadata
- `config/defi.ts` — Protocol contract addresses

**Dual valuation model**: Positions have both "Fair Value" (mark-to-market) and "Cash Value" (liquidation value). P&L snapshots are stored in SQLite for weekly/monthly heatmap calculations.

**Supported chains**: Ethereum, Arbitrum, Optimism, Base, Polygon, BSC, Avalanche
**Supported protocols**: Uniswap V3, Aave V3, Morpho Blue, Morpho Vault, Hyperliquid HLP

**Production build**: frontend compiles to `dist/`, then copied to `client/`, which Express serves as static files. No separate frontend server in production.

## Design Document

The primary architecture reference is `design/DESIGN.md` — read it for data model details, P&L calculation logic, and protocol integration specifics.
