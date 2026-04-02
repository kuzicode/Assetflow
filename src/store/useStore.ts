import { create } from 'zustand';
import type { TokenPosition, PnlRecord, RevenueOverview, ManualAsset, Wallet, AppSettings, YieldsData } from '../types';
import { API_BASE } from '../config/chains';

const POSITIONS_CACHE_KEY = 'assetflow_positions_cache';

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

interface AppState {
  // Data
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

  // Auth
  authMode: 'admin' | 'guest' | null;
  setAuthMode: (mode: 'admin' | 'guest' | null) => void;

  // UI
  loading: boolean;
  error: string | null;

  // Actions
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

const api = async (path: string, options?: RequestInit) => {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
};

export const useStore = create<AppState>((set) => ({
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
  authMode: (localStorage.getItem('authMode') as 'admin' | 'guest' | null) ?? null,
  setAuthMode: (mode) => {
    if (mode) localStorage.setItem('authMode', mode);
    else localStorage.removeItem('authMode');
    set({ authMode: mode });
  },
  loading: false,
  error: null,

  loadPositions: async () => {
    try {
      const cached = localStorage.getItem(POSITIONS_CACHE_KEY);
      if (cached) {
        const { date, positions, prices, timestamp } = JSON.parse(cached);
        if (date === getTodayUTC()) {
          set({ positions, prices, positionsUpdatedAt: timestamp || null });
          return;
        }
      }
    } catch {}
    // No valid cache — fetch fresh
    set({ loading: true, error: null });
    try {
      const data = await api('/api/positions/fetch', { method: 'POST', body: '{}' });
      localStorage.setItem(POSITIONS_CACHE_KEY, JSON.stringify({
        date: getTodayUTC(),
        positions: data.positions,
        prices: data.prices || {},
        timestamp: data.timestamp || new Date().toISOString(),
      }));
      set({ positions: data.positions, prices: data.prices || {}, positionsUpdatedAt: data.timestamp || null, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchPositions: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api('/api/positions/fetch', { method: 'POST', body: '{}' });
      localStorage.setItem(POSITIONS_CACHE_KEY, JSON.stringify({
        date: getTodayUTC(),
        positions: data.positions,
        prices: data.prices || {},
        timestamp: data.timestamp || new Date().toISOString(),
      }));
      set({ positions: data.positions, prices: data.prices || {}, positionsUpdatedAt: data.timestamp || null, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchWeeklyPnl: async () => {
    try {
      const data = await api('/api/pnl/weekly');
      set({ weeklyPnl: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  fetchMonthlyPnl: async () => {
    try {
      const data = await api('/api/pnl/monthly');
      set({ monthlyPnl: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  createWeeklyPnl: async (data) => {
    const record = await api('/api/pnl/weekly', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    set((state) => ({
      weeklyPnl: [record, ...state.weeklyPnl]
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()),
    }));
  },

  createMonthlyPnl: async (data) => {
    const record = await api('/api/pnl/monthly', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    set((state) => ({
      monthlyPnl: [record, ...state.monthlyPnl].sort(
        (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      ),
    }));
  },

  updatePnlRecord: async (id, data) => {
    const record = await api(`/api/pnl/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    set((state) => ({
      weeklyPnl: state.weeklyPnl.map((r) => (r.id === id ? record : r)),
      monthlyPnl: state.monthlyPnl.map((r) => (r.id === id ? record : r)),
    }));
  },

  deletePnlRecord: async (id) => {
    await api(`/api/pnl/${id}`, { method: 'DELETE' });
    set((state) => ({
      weeklyPnl: state.weeklyPnl.filter((r) => r.id !== id),
      monthlyPnl: state.monthlyPnl.filter((r) => r.id !== id),
    }));
  },

  fetchRevenueOverview: async () => {
    try {
      const data = await api('/api/pnl/revenue');
      set({ revenueOverview: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  updateRevenueOverview: async (data) => {
    const result = await api('/api/pnl/revenue', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    set({ revenueOverview: result });
  },

  fetchManualAssets: async () => {
    try {
      const data = await api('/api/positions/manual');
      set({ manualAssets: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  fetchWallets: async () => {
    try {
      const data = await api('/api/wallets');
      set({ wallets: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  fetchSettings: async () => {
    try {
      const data = await api('/api/settings');
      set({ settings: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  fetchSpotPrices: async () => {
    try {
      const data = await api('/api/prices?symbols=BTC,ETH,SOL,BNB');
      set({ spotPrices: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  fetchYields: async (force = false) => {
    try {
      const data = await api(`/api/yields${force ? '?force=1' : ''}`);
      set({ yields: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  setError: (error) => set({ error }),
}));
