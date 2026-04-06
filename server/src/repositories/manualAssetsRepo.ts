import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let DATA_DIR = path.join(__dirname, '../../data');

export function setManualAssetsDataDir(dir: string) {
  DATA_DIR = dir;
}

export function getManualAssetsDataDir(): string {
  return DATA_DIR;
}

export interface ManualAssetRow {
  id: string;
  label: string;
  baseToken: string;
  amount: number;
  source: string;
  platform: string;
  updatedAt: string;
}

function getPath(): string {
  return path.join(DATA_DIR, 'manual_assets.json');
}

function read(): ManualAssetRow[] {
  try {
    const data = JSON.parse(fs.readFileSync(getPath(), 'utf-8'));
    return Array.isArray(data.records) ? data.records : [];
  } catch {
    return [];
  }
}

function write(records: ManualAssetRow[]): void {
  const p = getPath();
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ records }, null, 2), 'utf-8');
  fs.renameSync(tmp, p);
}

export function listManualAssetRows(): ManualAssetRow[] {
  return read().sort((a, b) => a.baseToken.localeCompare(b.baseToken) || a.label.localeCompare(b.label));
}

export function upsertManualAsset(input: ManualAssetRow): void {
  const records = read();
  const idx = records.findIndex((r) => r.id === input.id);
  if (idx >= 0) {
    records[idx] = input;
  } else {
    records.push(input);
  }
  write(records);
}

export function deleteManualAsset(id: string): boolean {
  const records = read();
  const filtered = records.filter((r) => r.id !== id);
  if (filtered.length === records.length) return false;
  write(filtered);
  return true;
}
