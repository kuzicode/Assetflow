import { afterAll, describe, expect, it, vi } from 'vitest';
import { createTestDataDir } from '../test/setup.js';

const { dir: testDataDir, cleanup: cleanupDataDir } = createTestDataDir();

const { mockGetPositionsSnapshot } = vi.hoisted(() => ({
  mockGetPositionsSnapshot: vi.fn(async () => ({
    positions: [],
    prices: {},
    timestamp: new Date().toISOString(),
    incomeBreakdown: { uniswap: 100, morpho: 200, hlp: 300, total: 600 },
    isStale: false,
    missingSymbols: [],
    partialFailureSources: [],
  })),
}));

vi.mock('../services/positionsService.js', () => ({
  getPositionsSnapshot: mockGetPositionsSnapshot,
}));

const { setPnlDataDir } = await import('../repositories/pnlRepo.js');
const {
  createMonthlyPnlRecord,
  createWeeklyPnlRecord,
  getMonthlyPnlRecords,
  getRevenueOverview,
  getWeeklyPnlRecords,
  runDailyPnlAutoAccumulate,
  updatePnlRecordById,
  updateRevenueOverview,
} = await import('../services/pnlService.js');

setPnlDataDir(testDataDir);

afterAll(() => cleanupDataDir());

describe('pnl service', () => {
  it('returns empty arrays initially', () => {
    expect(getWeeklyPnlRecords({})).toEqual([]);
    expect(getMonthlyPnlRecords({})).toEqual([]);
  });

  it('creates weekly and monthly pending records', async () => {
    const weekly = await createWeeklyPnlRecord({
      startDate: '2026-03-09',
      startingCapital: 5050000,
    });
    expect(weekly!.status).toBe('pending');
    expect(weekly!.lastUniswapValue).toBe(100);
    expect(weekly!.lastMorphoValue).toBe(200);
    expect(weekly!.lastHlpValue).toBe(300);

    const monthly = await createMonthlyPnlRecord({
      month: '2026-03',
      startingCapital: 5050000,
      auto: true,
    });
    expect(monthly!.status).toBe('pending');
  });

  it('keeps monthly pending after manual edit', () => {
    const monthly = getMonthlyPnlRecords({}).find((record) => record!.status === 'pending');
    expect(monthly).toBeTruthy();
    const updated = updatePnlRecordById(monthly!.id, { pnl: 1234, days: 10 });
    expect(updated?.status).toBe('pending');
    expect(updated?.autoAccumulate).toBe(true);
    expect(updated?.editable).toBe(true);
  });

  it('updates pending weekly row once per day', async () => {
    const weekly = getWeeklyPnlRecords({}).find((record) => record!.status === 'pending');
    expect(weekly).toBeTruthy();

    const run1 = await runDailyPnlAutoAccumulate('2026-03-10');
    expect(run1.updated).toBeGreaterThan(0);

    const row1 = getWeeklyPnlRecords({}).find((record) => record!.id === weekly!.id);
    expect(row1?.pnl).toBe(0);

    const run2 = await runDailyPnlAutoAccumulate('2026-03-10');
    expect(run2.updated).toBe(0);
  });

  it('does not overwrite pnl when income fetch fails', async () => {
    const weekly = getWeeklyPnlRecords({}).find((record) => record!.status === 'pending');
    const pnlBefore = weekly?.pnl;

    mockGetPositionsSnapshot.mockRejectedValueOnce(new Error('network down'));
    const run = await runDailyPnlAutoAccumulate('2026-03-12');
    expect(run.updated).toBe(0);

    const row = getWeeklyPnlRecords({}).find((record) => record!.id === weekly?.id);
    expect(row?.pnl).toBe(pnlBefore);
  });

  it('creates and updates revenue overview', () => {
    updateRevenueOverview({
      periodLabel: '2026',
      startDate: '2026-01-01',
      endDate: '2026-03-19',
      initialInvestment: 5333035,
      fairValue: 5517228,
      cashValue: 5280692,
    });

    const overview = getRevenueOverview();
    expect(overview?.fairValue).toBe(5517228);
    expect(overview?.profit).toBe(5517228 - 5333035);
  });
});
