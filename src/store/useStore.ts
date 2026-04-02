import { create } from 'zustand';
import type { AppSettings, ManualAsset, PnlRecord, PositionsSnapshot, PriceSnapshot, RevenueOverview, TokenPosition, Wallet, YieldsData } from '../types';
import { apiFetch } from '../lib/api';

const POSITIONS_CACHE_KEY = 'assetflow_positions_cache';

function getTodayUTC() {
  return new Date().toISOString().slice(0, 10);
}

interface AppState {
  positions: TokenPosition[];
  weeklyPnl: PnlRecord[];
  monthlyPnl: PnlRecord[];
  revenueOverview: RevenueOverview | null;
  manualAssets: ManualAsset[];
  wallets: Wallet[];
  settings: AppSettings | null;
  prices: Record<string, number>;
  spotPrices: Record<string, number>;
  yields: YieldsData | null;
  positionsUpdatedAt: string | null;
  positionsIsStale: boolean;
  positionMissingSymbols: string[];
  positionFailureSources: string[];
  spotPriceFailureSources: string[];
  authMode: 'admin' | 'guest' | null;
  authToken: string | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  setAuthState: (state: { mode: 'admin' | 'guest' | null; token?: string | null }) => void;
  initializeApp: () => Promise<void>;
  loadPositions: () => Promise<void>;
  fetchPositions: () => Promise<void>;
  fetchWeeklyPnl: () => Promise<void>;
  fetchMonthlyPnl: () => Promise<void>;
  createWeeklyPnl: (data: { startDate: string; endDate?: string; startingCapital?: number; pnl?: number; days?: number }) => Promise<void>;
  createMonthlyPnl: (data: { month: string; startingCapital?: number; pnl?: number; days?: number; auto?: boolean; endDate?: string }) => Promise<void>;
  updatePnlRecord: (id: string, data: Partial<PnlRecord>) => Promise<void>;
  deletePnlRecord: (id: string) => Promise<void>;
  fetchRevenueOverview: () => Promise<void>;
  updateRevenueOverview: (data: Omit<RevenueOverview, 'id'>) => Promise<void>;
  fetchManualAssets: () => Promise<void>;
  fetchWallets: () => Promise<void>;
  fetchSettings: () => Promise<void>;
  fetchSpotPrices: () => Promise<void>;
  fetchYields: (force?: boolean) => Promise<void>;
  setError: (error: string | null) => void;
}

function isAuthError(error: unknown) {
  return error instanceof Error && /401|authentication required/i.test(error.message);
}

function getPositionsRequest(authMode: 'admin' | 'guest' | null, authToken: string | null) {
  const canForceRefresh = authMode === 'admin' && !!authToken;
  return {
    path: canForceRefresh ? '/api/positions/refresh' : '/api/positions',
    method: canForceRefresh ? 'POST' : 'GET',
  } as const;
}

function readCachedPositions(): PositionsSnapshot | null {
  try {
    const raw = localStorage.getItem(POSITIONS_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached.date !== getTodayUTC()) return null;
    return {
      positions: cached.positions || [],
      prices: cached.prices || {},
      timestamp: cached.timestamp || new Date().toISOString(),
      isStale: !!cached.isStale,
      missingSymbols: cached.missingSymbols || [],
      partialFailureSources: cached.partialFailureSources || [],
    };
  } catch {
    return null;
  }
}

function writeCachedPositions(snapshot: PositionsSnapshot) {
  localStorage.setItem(POSITIONS_CACHE_KEY, JSON.stringify({
    date: getTodayUTC(),
    positions: snapshot.positions,
    prices: snapshot.prices,
    timestamp: snapshot.timestamp,
    isStale: snapshot.isStale,
    missingSymbols: snapshot.missingSymbols,
    partialFailureSources: snapshot.partialFailureSources,
  }));
}

function setPositionState(snapshot: PositionsSnapshot) {
  return {
    positions: snapshot.positions,
    prices: snapshot.prices,
    positionsUpdatedAt: snapshot.timestamp,
    positionsIsStale: snapshot.isStale,
    positionMissingSymbols: snapshot.missingSymbols,
    positionFailureSources: snapshot.partialFailureSources,
  };
}

export const useStore = create<AppState>((set, get) => ({
  positions: [],
  weeklyPnl: [],
  monthlyPnl: [],
  revenueOverview: null,
  manualAssets: [],
  wallets: [],
  settings: null,
  prices: {},
  spotPrices: {},
  yields: null,
  positionsUpdatedAt: null,
  positionsIsStale: false,
  positionMissingSymbols: [],
  positionFailureSources: [],
  spotPriceFailureSources: [],
  authMode: (localStorage.getItem('authMode') as 'admin' | 'guest' | null) ?? null,
  authToken: localStorage.getItem('assetflow_admin_token'),
  loading: false,
  error: null,
  initialized: false,

  setAuthState: ({ mode, token }) => {
    if (mode) localStorage.setItem('authMode', mode);
    else localStorage.removeItem('authMode');

    if (token) localStorage.setItem('assetflow_admin_token', token);
    else if (mode !== 'admin') localStorage.removeItem('assetflow_admin_token');

    set({
      authMode: mode,
      authToken: token ?? (mode === 'admin' ? get().authToken : null),
    });
  },

  initializeApp: async () => {
    if (get().initialized) return;
    const cached = readCachedPositions();
    if (cached) set(setPositionState(cached));

    await Promise.all([
      get().fetchRevenueOverview(),
      get().fetchWeeklyPnl(),
      get().fetchMonthlyPnl(),
      get().fetchManualAssets(),
      get().fetchWallets(),
      get().fetchSettings(),
      get().fetchSpotPrices(),
      get().fetchYields(),
      get().loadPositions(),
    ]);

    set({ initialized: true });
  },

  loadPositions: async () => {
    const cached = readCachedPositions();
    if (cached) {
      set(setPositionState(cached));
    }
    set({ loading: true, error: null });
    try {
      const data = await apiFetch('/api/positions');
      writeCachedPositions(data);
      set({ ...setPositionState(data), loading: false });
    } catch (error: unknown) {
      if (cached) {
        set({ loading: false, error: isAuthError(error) ? '登录状态已失效，请重新登录后执行管理员操作。' : (error instanceof Error ? error.message : '加载资产失败') });
        return;
      }
      set({ error: error instanceof Error ? error.message : '加载资产失败', loading: false });
    }
  },

  fetchPositions: async () => {
    set({ loading: true, error: null });
    try {
      const { authMode, authToken } = get();
      const request = getPositionsRequest(authMode, authToken);
      let data;
      try {
        data = await apiFetch(request.path, { method: request.method });
      } catch (error: unknown) {
        if (request.method === 'POST' && isAuthError(error)) {
          data = await apiFetch('/api/positions', { method: 'GET' });
          set({ error: '管理员登录已过期，已切换为只读刷新结果。' });
        } else {
          throw error;
        }
      }
      writeCachedPositions(data);
      set({ ...setPositionState(data), loading: false });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : '刷新资产失败', loading: false });
    }
  },

  fetchWeeklyPnl: async () => {
    try {
      const data = await apiFetch('/api/pnl/weekly');
      set({ weeklyPnl: data });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  fetchMonthlyPnl: async () => {
    try {
      const data = await apiFetch('/api/pnl/monthly');
      set({ monthlyPnl: data });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  createWeeklyPnl: async (data) => {
    const record = await apiFetch('/api/pnl/weekly', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    set((state) => ({
      weeklyPnl: [record, ...state.weeklyPnl].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()),
    }));
  },

  createMonthlyPnl: async (data) => {
    const record = await apiFetch('/api/pnl/monthly', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    set((state) => ({
      monthlyPnl: [record, ...state.monthlyPnl].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()),
    }));
  },

  updatePnlRecord: async (id, data) => {
    const record = await apiFetch(`/api/pnl/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    set((state) => ({
      weeklyPnl: state.weeklyPnl.map((item) => (item.id === id ? record : item)),
      monthlyPnl: state.monthlyPnl.map((item) => (item.id === id ? record : item)),
    }));
  },

  deletePnlRecord: async (id) => {
    await apiFetch(`/api/pnl/${id}`, { method: 'DELETE' });
    set((state) => ({
      weeklyPnl: state.weeklyPnl.filter((item) => item.id !== id),
      monthlyPnl: state.monthlyPnl.filter((item) => item.id !== id),
    }));
  },

  fetchRevenueOverview: async () => {
    try {
      const data = await apiFetch('/api/pnl/revenue');
      set({ revenueOverview: data });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  updateRevenueOverview: async (data) => {
    const result = await apiFetch('/api/pnl/revenue', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    set({ revenueOverview: result });
  },

  fetchManualAssets: async () => {
    try {
      const data = await apiFetch('/api/positions/manual');
      set({ manualAssets: data });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  fetchWallets: async () => {
    try {
      const data = await apiFetch('/api/wallets');
      set({ wallets: data });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  fetchSettings: async () => {
    try {
      const data = await apiFetch('/api/settings');
      set({ settings: data });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  fetchSpotPrices: async () => {
    try {
      const data: PriceSnapshot = await apiFetch('/api/prices?symbols=BTC,ETH,SOL,BNB');
      set({
        spotPrices: data.prices,
        spotPriceFailureSources: data.partialFailureSources,
      });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  fetchYields: async (force = false) => {
    try {
      const data = await apiFetch(`/api/yields${force ? '?force=1' : ''}`);
      set({ yields: data });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  setError: (error) => set({ error }),
}));
