import db from '../db/index.js';

export function listPnlRecords(period: 'weekly' | 'monthly', from?: string, to?: string) {
  let sql = 'SELECT * FROM pnl_records WHERE period = ?';
  const params: any[] = [period];
  if (from) {
    sql += ' AND start_date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND end_date <= ?';
    params.push(to);
  }
  sql += ' ORDER BY start_date DESC';
  return db.prepare(sql).all(...params) as any[];
}

export function getPnlRecordById(id: string) {
  return db.prepare('SELECT * FROM pnl_records WHERE id = ?').get(id) as any;
}

export function getLatestPnlRecord(period: 'weekly' | 'monthly', status: string) {
  return db.prepare(
    'SELECT * FROM pnl_records WHERE period = ? AND status = ? ORDER BY start_date DESC LIMIT 1'
  ).get(period, status) as any;
}

export function getLatestNonInProgressWeekly() {
  return db.prepare(
    "SELECT * FROM pnl_records WHERE period = 'weekly' AND status != 'in_progress' ORDER BY start_date DESC LIMIT 1"
  ).get() as any;
}

export function listInProgressPnlRecords() {
  return db.prepare("SELECT * FROM pnl_records WHERE status = 'in_progress' AND auto_accumulate = 1").all() as any[];
}

export function runInTransaction<T>(fn: () => T) {
  return db.transaction(fn)();
}

export { db };
