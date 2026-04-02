import db from '../db/index.js';

export function findAutoSnapshotByDatePrefix(datePrefix: string) {
  return db.prepare(
    "SELECT id FROM snapshots WHERE timestamp LIKE ? AND type = 'auto'"
  ).get(`${datePrefix}%`) as any;
}

export function insertSnapshot(input: {
  id: string;
  timestamp: string;
  type: 'auto' | 'manual';
  totalFairValue: number;
  totalCashValue: number;
  positionsJson: string;
  pricesJson: string;
}) {
  db.prepare(`
    INSERT INTO snapshots (id, timestamp, type, total_fair_value, total_cash_value, positions_json, prices_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.timestamp,
    input.type,
    input.totalFairValue,
    input.totalCashValue,
    input.positionsJson,
    input.pricesJson
  );
}

export function listSnapshots(filters: { from?: string; to?: string; limit?: number }) {
  let sql = 'SELECT * FROM snapshots WHERE 1=1';
  const params: any[] = [];
  if (filters.from) {
    sql += ' AND timestamp >= ?';
    params.push(filters.from);
  }
  if (filters.to) {
    sql += ' AND timestamp <= ?';
    params.push(filters.to);
  }
  sql += ' ORDER BY timestamp DESC';
  if (filters.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }
  return db.prepare(sql).all(...params) as any[];
}

export function getLatestSnapshots(limit: number) {
  return db.prepare('SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT ?').all(limit) as any[];
}
