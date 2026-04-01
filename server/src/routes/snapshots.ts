import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { fetchPositionsAggregate } from './positions.js';

const router = Router();

/**
 * 每日自动快照：抓取仓位聚合数据，写入 snapshots 表
 * 幂等：同一天（UTC+8）只写一次
 */
export async function runAutoSnapshot() {
  const now = new Date(Date.now() + 8 * 3600_000); // UTC+8
  const dateStr = now.toISOString().slice(0, 10);
  const existing: any = db.prepare(
    "SELECT id FROM snapshots WHERE timestamp LIKE ? AND type = 'auto'"
  ).get(`${dateStr}%`);
  if (existing) return { skipped: true, date: dateStr };

  const data = await fetchPositionsAggregate();
  const totalUsd = data.positions.reduce((s: number, p: any) => s + p.totalUsdValue, 0);
  const id = uuidv4();
  const timestamp = new Date().toISOString();

  db.prepare(`
    INSERT INTO snapshots (id, timestamp, type, total_fair_value, total_cash_value, positions_json, prices_json)
    VALUES (?, ?, 'auto', ?, ?, ?, ?)
  `).run(id, timestamp, totalUsd, totalUsd, JSON.stringify(data.positions), JSON.stringify(data.prices));

  return { skipped: false, date: dateStr, totalUsd };
}

// POST /api/snapshots - 创建快照
router.post('/', (req, res) => {
  const { type, totalFairValue, totalCashValue, positions, prices } = req.body;

  const id = uuidv4();
  const timestamp = new Date().toISOString();

  db.prepare(`
    INSERT INTO snapshots (id, timestamp, type, total_fair_value, total_cash_value, positions_json, prices_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, timestamp, type || 'manual', totalFairValue || 0, totalCashValue || 0,
    JSON.stringify(positions || []), JSON.stringify(prices || {}));

  res.json({ id, timestamp, type: type || 'manual' });
});

// GET /api/snapshots
router.get('/', (req, res) => {
  const { from, to, limit } = req.query;

  let sql = 'SELECT * FROM snapshots WHERE 1=1';
  const params: any[] = [];

  if (from) {
    sql += ' AND timestamp >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND timestamp <= ?';
    params.push(to);
  }
  sql += ' ORDER BY timestamp DESC';
  if (limit) {
    sql += ' LIMIT ?';
    params.push(Number(limit));
  }

  const snapshots = db.prepare(sql).all(...params);
  res.json(snapshots.map((s: any) => ({
    ...s,
    positions: JSON.parse(s.positions_json),
    prices: JSON.parse(s.prices_json),
    totalFairValue: s.total_fair_value,
    totalCashValue: s.total_cash_value,
  })));
});

export default router;
