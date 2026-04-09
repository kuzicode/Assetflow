import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let DATA_DIR = path.join(__dirname, '../../data');
export function setSettingsDataDir(dir) {
    DATA_DIR = dir;
}
export function getSettingsDataDir() {
    return DATA_DIR;
}
const DEFAULTS = {
    settlement_day: '4',
    auto_snapshot: 'false',
    base_currency: 'USDT',
};
function getPath() {
    return path.join(DATA_DIR, 'settings.json');
}
function read() {
    try {
        const data = JSON.parse(fs.readFileSync(getPath(), 'utf-8'));
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            return { ...DEFAULTS, ...data };
        }
        return { ...DEFAULTS };
    }
    catch {
        return { ...DEFAULTS };
    }
}
function write(settings) {
    const p = getPath();
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8');
    fs.renameSync(tmp, p);
}
export function getSettingsMap() {
    return read();
}
export function getSetting(key) {
    return read()[key];
}
export function upsertSettings(updates) {
    const current = read();
    write({ ...current, ...updates });
}
