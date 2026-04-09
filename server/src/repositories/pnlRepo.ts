import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let PNL_DATA_DIR = path.join(__dirname, '../../data');

export function setPnlDataDir(dir: string) {
  PNL_DATA_DIR = dir;
}

export function getPnlDataDir(): string {
  return PNL_DATA_DIR;
}

export type PnlStatus = 'pending' | 'done';

export interface PnlRecord {
  id: string;
  period: 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  startingCapital: number;
  endingCapital: number;
  pnl: number;
  returnRate: number;
  days: number;
  annualizedReturn: number;
  status: PnlStatus;
  autoAccumulate: boolean;
  editable: boolean;
  incomeUniswap: number;
  incomeMorpho: number;
  incomeHlp: number;
  incomeTotal: number;
  lastUniswapValue: number;
  lastMorphoValue: number;
  lastHlpValue: number;
  lastAutoUpdateAt: string | null;
  basePnl: number;
  customLabel?: string;
}

function getJsonPath(period: 'weekly' | 'monthly'): string {
  return path.join(PNL_DATA_DIR, `${period}_pnl.json`);
}

function readRecords(period: 'weekly' | 'monthly'): PnlRecord[] {
  try {
    const data = JSON.parse(fs.readFileSync(getJsonPath(period), 'utf-8'));
    return Array.isArray(data.records) ? data.records : [];
  } catch {
    return [];
  }
}

function writeRecords(period: 'weekly' | 'monthly', records: PnlRecord[]): void {
  const filePath = getJsonPath(period);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify({ records }, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function listPnlRecords(period: 'weekly' | 'monthly', from?: string, to?: string): PnlRecord[] {
  let records = readRecords(period);
  if (from) records = records.filter((r) => r.startDate >= from);
  if (to) records = records.filter((r) => r.endDate <= to);
  return records.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export function getPnlRecordById(id: string): PnlRecord | undefined {
  for (const period of ['weekly', 'monthly'] as const) {
    const found = readRecords(period).find((r) => r.id === id);
    if (found) return found;
  }
  return undefined;
}

export function getLatestPnlRecord(period: 'weekly' | 'monthly', status: PnlStatus): PnlRecord | undefined {
  return readRecords(period)
    .filter((r) => r.status === status)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

export function getLatestNonInProgressWeekly(): PnlRecord | undefined {
  return getLatestPnlRecord('weekly', 'done');
}

export function listInProgressPnlRecords(): PnlRecord[] {
  return (['weekly', 'monthly'] as const)
    .flatMap(readRecords)
    .filter((r) => r.status === 'pending' && r.autoAccumulate);
}

export function insertRecord(record: PnlRecord): void {
  const records = readRecords(record.period);
  records.push(record);
  writeRecords(record.period, records);
}

export function updateRecord(id: string, fields: Partial<PnlRecord>): PnlRecord | undefined {
  for (const period of ['weekly', 'monthly'] as const) {
    const records = readRecords(period);
    const idx = records.findIndex((r) => r.id === id);
    if (idx === -1) continue;
    records[idx] = { ...records[idx], ...fields };
    writeRecords(period, records);
    return records[idx];
  }
  return undefined;
}

export function deleteRecord(id: string): boolean {
  for (const period of ['weekly', 'monthly'] as const) {
    const records = readRecords(period);
    const filtered = records.filter((r) => r.id !== id);
    if (filtered.length !== records.length) {
      writeRecords(period, filtered);
      return true;
    }
  }
  return false;
}

