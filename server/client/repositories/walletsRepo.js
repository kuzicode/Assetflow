import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let DATA_DIR = path.join(__dirname, '../../data');
export function setWalletsDataDir(dir) {
    DATA_DIR = dir;
}
export function getWalletsDataDir() {
    return DATA_DIR;
}
function getPath() {
    return path.join(DATA_DIR, 'wallets.json');
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
export function listWalletRows() {
    return read().sort((a, b) => a.label.localeCompare(b.label) || a.address.localeCompare(b.address));
}
export function insertWallet(id, label, address, chains) {
    const records = read();
    records.push({ id, label, address, chains });
    write(records);
}
export function updateWalletLabel(id, label) {
    const records = read();
    const idx = records.findIndex((r) => r.id === id);
    if (idx === -1)
        return false;
    records[idx] = { ...records[idx], label };
    write(records);
    return true;
}
export function deleteWallet(id) {
    const records = read();
    const filtered = records.filter((r) => r.id !== id);
    if (filtered.length === records.length)
        return false;
    write(filtered);
    return true;
}
