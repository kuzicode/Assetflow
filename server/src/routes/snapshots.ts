import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';

const router = Router();

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
