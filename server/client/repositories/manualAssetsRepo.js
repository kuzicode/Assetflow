import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let DATA_DIR = path.join(__dirname, '../../data');
export function setManualAssetsDataDir(dir) {
    DATA_DIR = dir;
}
export function getManualAssetsDataDir() {
    return DATA_DIR;
}
function getPath() {
    return path.join(DATA_DIR, 'manual_assets.json');
}
function read() {
    try {
        const data = JSON.parse(fs.readFileSync(getPath(), 'utf-8'));
        return Array.isArray(data.records) ? data.records : [];
    }
    catch {
        return [];
    }
}
function write(records) {
    const p = getPath();
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ records }, null, 2), 'utf-8');
    fs.renameSync(tmp, p);
}
export function listManualAssetRows() {
    return read().sort((a, b) => a.baseToken.localeCompare(b.baseToken) || a.label.localeCompare(b.label));
}
export function upsertManualAsset(input) {
    const records = read();
    const idx = records.findIndex((r) => r.id === input.id);
    if (idx >= 0) {
        records[idx] = input;
    }
    else {
        records.push(input);
    }
    write(records);
}
export function deleteManualAsset(id) {
    const records = read();
    const filtered = records.filter((r) => r.id !== id);
    if (filtered.length === records.length)
        return false;
    write(filtered);
    return true;
}
