/**
 * One-time migration: pnl_records (SQLite) → weekly_pnl.json + monthly_pnl.json
 * Safe to re-run: overwrites JSON files with SQLite source of truth.
 * Run after build: node server/dist/scripts/migratePnlToJson.js
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'assetflow.db');

function mapStatus(status: string): 'pending' | 'done' {
  return status === 'in_progress' ? 'pending' : 'done';
}

function toRecord(row: any) {
  return {
    id: row.id,
    period: row.period,
    startDate: row.start_date,
    endDate: row.end_date,
    startingCapital: row.starting_capital,
    endingCapital: row.ending_capital,
    pnl: row.pnl,
    returnRate: row.return_rate,
    days: row.days,
    annualizedReturn: row.annualized_return,
    status: mapStatus(row.status || 'settled'),
    autoAccumulate: row.auto_accumulate === 1,
    editable: row.editable === 1,
    incomeUniswap: row.income_uniswap || 0,
    incomeMorpho: row.income_morpho || 0,
    incomeHlp: row.income_hlp || 0,
    incomeTotal: row.income_total || 0,
    lastUniswapValue: row.last_uniswap_value || 0,
    lastMorphoValue: row.last_morpho_value || 0,
    lastHlpValue: row.last_hlp_value || 0,
    lastAutoUpdateAt: row.last_auto_update_at || null,
    basePnl: row.base_pnl || 0,
  };
}

function writeJson(filePath: string, records: any[]) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ records }, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
  console.log(`Written ${records.length} records → ${path.basename(filePath)}`);
}

const db = new Database(DB_PATH, { readonly: true });
const rows: any[] = db.prepare('SELECT * FROM pnl_records ORDER BY start_date ASC').all();
db.close();

const weekly = rows.filter((r) => r.period === 'weekly').map(toRecord);
const monthly = rows.filter((r) => r.period === 'monthly').map(toRecord);

writeJson(path.join(DATA_DIR, 'weekly_pnl.json'), weekly);
writeJson(path.join(DATA_DIR, 'monthly_pnl.json'), monthly);

console.log('Migration complete.');
