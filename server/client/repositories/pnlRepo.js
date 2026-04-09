import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let PNL_DATA_DIR = path.join(__dirname, '../../data');
export function setPnlDataDir(dir) {
    PNL_DATA_DIR = dir;
}
export function getPnlDataDir() {
    return PNL_DATA_DIR;
}
function getJsonPath(period) {
    return path.join(PNL_DATA_DIR, `${period}_pnl.json`);
}
function readRecords(period) {
    try {
        const data = JSON.parse(fs.readFileSync(getJsonPath(period), 'utf-8'));
        return Array.isArray(data.records) ? data.records : [];
    }
    catch {
        return [];
    }
}
function writeRecords(period, records) {
    const filePath = getJsonPath(period);
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify({ records }, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
}
export function listPnlRecords(period, from, to) {
    let records = readRecords(period);
    if (from)
        records = records.filter((r) => r.startDate >= from);
    if (to)
        records = records.filter((r) => r.endDate <= to);
    return records.sort((a, b) => b.startDate.localeCompare(a.startDate));
}
export function getPnlRecordById(id) {
    for (const period of ['weekly', 'monthly']) {
        const found = readRecords(period).find((r) => r.id === id);
        if (found)
            return found;
    }
    return undefined;
}
export function getLatestPnlRecord(period, status) {
    return readRecords(period)
        .filter((r) => r.status === status)
        .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}
export function getLatestNonInProgressWeekly() {
    return getLatestPnlRecord('weekly', 'done');
}
export function listInProgressPnlRecords() {
    return ['weekly', 'monthly']
        .flatMap(readRecords)
        .filter((r) => r.status === 'pending' && r.autoAccumulate);
}
export function insertRecord(record) {
    const records = readRecords(record.period);
    records.push(record);
    writeRecords(record.period, records);
}
export function updateRecord(id, fields) {
    for (const period of ['weekly', 'monthly']) {
        const records = readRecords(period);
        const idx = records.findIndex((r) => r.id === id);
        if (idx === -1)
            continue;
        records[idx] = { ...records[idx], ...fields };
        writeRecords(period, records);
        return records[idx];
    }
    return undefined;
}
export function deleteRecord(id) {
    for (const period of ['weekly', 'monthly']) {
        const records = readRecords(period);
        const filtered = records.filter((r) => r.id !== id);
        if (filtered.length !== records.length) {
            writeRecords(period, filtered);
            return true;
        }
    }
    return false;
}
