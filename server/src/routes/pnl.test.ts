import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createTestDb } from '../test/setup.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

const testDb = createTestDb();
vi.mock('../db/index.js', () => ({ default: testDb }));
vi.mock('./positions.js', () => ({
  fetchPositionsAggregate: vi.fn(async () => ({
    positions: [],
    prices: {},
    timestamp: new Date().toISOString(),
    incomeBreakdown: { uniswap: 100, morpho: 200, hlp: 300, total: 600 },
  })),
}));

const { default: express } = await import('express');
const { default: pnlRouter } = await import('./pnl.js');
const { runDailyPnlAutoAccumulate } = await import('./pnl.js');

const app = express();
app.use(express.json());
app.use('/api/pnl', pnlRouter);

describe('PnL API', () => {
  describe('GET /api/pnl/weekly & /api/pnl/monthly', () => {
    it('returns empty arrays initially', async () => {
      const weekly = await request(app).get('/api/pnl/weekly');
      expect(weekly.status).toBe(200);
      expect(weekly.body).toEqual([]);

      const monthly = await request(app).get('/api/pnl/monthly');
      expect(monthly.status).toBe(200);
      expect(monthly.body).toEqual([]);
    });
  });

  describe('POST /api/pnl/calculate', () => {
    beforeAll(() => {
      // Insert two snapshots for P&L calculation
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

    it('rejects invalid period', async () => {
      const res = await request(app)
        .post('/api/pnl/calculate')
        .send({ period: 'daily' });
      expect(res.status).toBe(400);
    });

    it('calculates weekly P&L correctly', async () => {
      const res = await request(app)
        .post('/api/pnl/calculate')
        .send({ period: 'weekly' });
      expect(res.status).toBe(200);

      const record = res.body;
      expect(record.period).toBe('weekly');
      expect(record.startDate).toBe('2026-03-01');
      expect(record.endDate).toBe('2026-03-08');
      expect(record.startingCapital).toBe(5000000);
      expect(record.endingCapital).toBe(5050000);
      expect(record.pnl).toBe(50000);
      expect(record.days).toBe(7);

      // returnRate = 50000 / 5000000 = 0.01
      expect(record.returnRate).toBeCloseTo(0.01, 6);
      // annualized = 0.01 / 7 * 365 = 0.5214...
      expect(record.annualizedReturn).toBeCloseTo(0.01 / 7 * 365, 4);
    });

    it('GET /api/pnl/weekly returns the calculated record', async () => {
      const res = await request(app).get('/api/pnl/weekly');
      expect(res.body).toHaveLength(1);
      expect(res.body[0].pnl).toBe(50000);
    });
  });

  describe('PUT /api/pnl/:id (manual adjustment)', () => {
    let recordId: string;

    beforeAll(async () => {
      const res = await request(app).get('/api/pnl/weekly');
      recordId = res.body[0].id;
    });

    it('adjusts a P&L record', async () => {
      const res = await request(app)
        .put(`/api/pnl/${recordId}`)
        .send({ pnl: 55000, returnRate: 0.011 });
      expect(res.status).toBe(200);
      expect(res.body.pnl).toBe(55000);
      expect(res.body.returnRate).toBe(0.011);
      expect(res.body.isAdjusted).toBe(true);
    });

    it('returns 404 for non-existent record', async () => {
      const res = await request(app)
        .put('/api/pnl/non-existent')
        .send({ pnl: 0 });
      expect(res.status).toBe(404);
    });
  });

  describe('In-progress weekly/monthly lifecycle', () => {
    it('creates weekly in-progress row', async () => {
      const res = await request(app)
        .post('/api/pnl/weekly')
        .send({ startDate: '2026-03-09', startingCapital: 5055000 });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('in_progress');
      expect(res.body.editable).toBe(true);
      expect(res.body.autoAccumulate).toBe(true);
    });

    it('creates monthly in-progress row with auto mode', async () => {
      const res = await request(app)
        .post('/api/pnl/monthly')
        .send({ month: '2026-03', startingCapital: 5050000, auto: true });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('in_progress');
      expect(res.body.editable).toBe(true);
    });

    it('locks monthly row after manual edit save', async () => {
      const monthly = await request(app).get('/api/pnl/monthly');
      const inProgress = monthly.body.find((r: any) => r.status === 'in_progress');
      const res = await request(app)
        .put(`/api/pnl/${inProgress.id}`)
        .send({ pnl: 1234, days: 10 });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('locked');
      expect(res.body.autoAccumulate).toBe(false);
      expect(res.body.editable).toBe(false);
    });
  });

  describe('Daily auto accumulate', () => {
    it('updates in-progress weekly row once per day', async () => {
      const weekly = await request(app).get('/api/pnl/weekly');
      const inProgress = weekly.body.find((r: any) => r.status === 'in_progress');
      expect(inProgress).toBeTruthy();

      const run1 = await runDailyPnlAutoAccumulate('2026-03-10');
      expect(run1.updated).toBeGreaterThan(0);

      const after1 = await request(app).get('/api/pnl/weekly');
      const row1 = after1.body.find((r: any) => r.id === inProgress.id);
      expect(row1.pnl).toBe(0);
      expect(row1.days).toBeGreaterThanOrEqual(1);

      const run2 = await runDailyPnlAutoAccumulate('2026-03-10');
      expect(run2.updated).toBe(0);
    });
  });

  describe('GET/PUT /api/pnl/revenue', () => {
    it('GET /api/pnl/revenue returns null initially', async () => {
      const res = await request(app).get('/api/pnl/revenue');
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it('PUT /api/pnl/revenue creates revenue overview', async () => {
      const res = await request(app)
        .put('/api/pnl/revenue')
        .send({
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
      expect(res.status).toBe(200);
      expect(res.body.periodLabel).toBe('2026: 0101-0319');
      expect(res.body.initialInvestment).toBe(5333035);
    });

    it('GET /api/pnl/revenue returns created overview', async () => {
      const res = await request(app).get('/api/pnl/revenue');
      expect(res.body.fairValue).toBe(5517228);
      expect(res.body.profit).toBe(184193);
    });

    it('PUT /api/pnl/revenue updates existing overview', async () => {
      const res = await request(app)
        .put('/api/pnl/revenue')
        .send({
          periodLabel: '2026: 0101-0325',
          startDate: '2026-01-01',
          initialInvestment: 5333035,
          fairValue: 5600000,
          cashValue: 5350000,
          profit: 266965,
          returnRate: 0.05,
          runningDays: 84,
          annualizedReturn: 0.2173,
        });
      expect(res.status).toBe(200);
      expect(res.body.fairValue).toBe(5600000);
    });
  });
});
