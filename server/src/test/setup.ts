import Database, { type Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf-8');

/**
 * Create a fresh in-memory SQLite database with the full schema applied.
 * Each test suite gets its own isolated DB instance.
 */
export function createTestDb(): DatabaseType {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(schema);
  return db;
}

/**
 * Create a temporary directory with empty weekly/monthly JSON files for test isolation.
 * Returns the dir path and a cleanup function.
 */
export function createTestPnlDir(): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pnl-test-'));
  fs.writeFileSync(path.join(dir, 'weekly_pnl.json'), '{"records":[]}', 'utf-8');
  fs.writeFileSync(path.join(dir, 'monthly_pnl.json'), '{"records":[]}', 'utf-8');
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  return { dir, cleanup };
}
