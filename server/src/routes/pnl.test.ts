import { beforeAll, describe, expect, it, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb } from '../test/setup.js';

const testDb = createTestDb();

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

vi.mock('../db/index.js', () => ({ default: testDb }));
vi.mock('../services/positionsService.js', () => ({
  getPositionsSnapshot: mockGetPositionsSnapshot,
}));

const {
  calculatePnlFromSnapshots,
  createMonthlyPnlRecord,
  createWeeklyPnlRecord,
  getMonthlyPnlRecords,
  getRevenueOverview,
  getWeeklyPnlRecords,
  runDailyPnlAutoAccumulate,
  updatePnlRecordById,
  updateRevenueOverview,
} = await import('../services/pnlService.js');

describe('pnl service', () => {
  beforeAll(() => {
    const snap1Id = uuidv4();
    const snap2Id = uuidv4();

    testDb.prepare(`
      INSERT INTO snapshots (id, timestamp, type, total_fair_value, total_cash_value, positions_json, prices_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(snap1Id, '2026-03-01T00:00:00Z', 'auto', 5000000, 4900000, '[]', '{}');

    testDb.prepare(`
      INSERT INTO snapshots (id, timestamp, type, total_fair_value, total_cash_value, positions_json, prices_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(snap2Id, '2026-03-08T00:00:00Z', 'auto', 5050000, 4950000, '[]', '{}');
  });

  it('returns empty arrays initially', () => {
    expect(getWeeklyPnlRecords({})).toEqual([]);
    expect(getMonthlyPnlRecords({})).toEqual([]);
  });

  it('calculates weekly P&L from snapshots', () => {
    const record = calculatePnlFromSnapshots('weekly');
    expect(record.period).toBe('weekly');
    expect(record.pnl).toBe(50000);
    expect(getWeeklyPnlRecords({})).toHaveLength(1);
  });

  it('creates weekly and monthly in-progress records', async () => {
    const weekly = await createWeeklyPnlRecord({
      startDate: '2026-03-09',
      startingCapital: 5050000,
    });
    expect(weekly.status).toBe('in_progress');
    expect(weekly.lastUniswapValue).toBe(100);
    expect(weekly.lastMorphoValue).toBe(200);
    expect(weekly.lastHlpValue).toBe(300);

    const monthly = await createMonthlyPnlRecord({
      month: '2026-03',
      startingCapital: 5050000,
      auto: true,
    });
    expect(monthly.status).toBe('in_progress');
  });

  it('keeps monthly in progress after manual edit', () => {
    const monthly = getMonthlyPnlRecords({}).find((record) => record.status === 'in_progress');
    expect(monthly).toBeTruthy();
    const updated = updatePnlRecordById(monthly!.id, { pnl: 1234, days: 10 });
    expect(updated?.status).toBe('in_progress');
    expect(updated?.autoAccumulate).toBe(true);
    expect(updated?.editable).toBe(true);
  });

  it('updates in-progress weekly row once per day', async () => {
    const weekly = getWeeklyPnlRecords({}).find((record) => record.status === 'in_progress');
    expect(weekly).toBeTruthy();

    const run1 = await runDailyPnlAutoAccumulate('2026-03-10');
    expect(run1.updated).toBeGreaterThan(0);

    const row1 = getWeeklyPnlRecords({}).find((record) => record.id === weekly!.id);
    expect(row1?.pnl).toBe(0);

    const run2 = await runDailyPnlAutoAccumulate('2026-03-10');
    expect(run2.updated).toBe(0);
  });

  it('does not overwrite pnl when income fetch fails', async () => {
    const weekly = getWeeklyPnlRecords({}).find((record) => record.status === 'in_progress');
    const pnlBefore = weekly?.pnl;

    mockGetPositionsSnapshot.mockRejectedValueOnce(new Error('network down'));
    const run = await runDailyPnlAutoAccumulate('2026-03-12');
    expect(run.updated).toBe(0);

    const row = getWeeklyPnlRecords({}).find((record) => record.id === weekly?.id);
    expect(row?.pnl).toBe(pnlBefore);
  });

  it('creates and updates revenue overview', () => {
    expect(getRevenueOverview()).toBeNull();

    updateRevenueOverview({
      periodLabel: '2026: 0101-0319',
      startDate: '2026-01-01',
      initialInvestment: 5333035,
      fairValue: 5517228,
      cashValue: 5280692,
      profit: 184193,
      returnRate: 0.0345,
      runningDays: 78,
      annualizedReturn: 0.1616,
    });

    const overview = getRevenueOverview();
    expect(overview?.fairValue).toBe(5517228);
    expect(overview?.profit).toBe(184193);
  });
});
