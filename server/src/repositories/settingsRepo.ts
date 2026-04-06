import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let DATA_DIR = path.join(__dirname, '../../data');

export function setSettingsDataDir(dir: string) {
  DATA_DIR = dir;
}

export function getSettingsDataDir(): string {
  return DATA_DIR;
}

const DEFAULTS: Record<string, string> = {
  settlement_day: '4',
  auto_snapshot: 'false',
  base_currency: 'USDT',
};

function getPath(): string {
  return path.join(DATA_DIR, 'settings.json');
}

function read(): Record<string, string> {
  try {
    const data = JSON.parse(fs.readFileSync(getPath(), 'utf-8'));
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return { ...DEFAULTS, ...data };
    }
    return { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(settings: Record<string, string>): void {
  const p = getPath();
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8');
  fs.renameSync(tmp, p);
}

export function getSettingsMap(): Record<string, string> {
  return read();
}

export function getSetting(key: string): string | undefined {
  return read()[key];
}

export function upsertSettings(updates: Record<string, string>): void {
  const current = read();
  write({ ...current, ...updates });
}
