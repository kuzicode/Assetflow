import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  deleteRecord,
  getLatestNonInProgressWeekly,
  getLatestPnlRecord,
  getPnlDataDir,
  getPnlRecordById,
  insertRecord,
  listInProgressPnlRecords,
  listPnlRecords,
  updateRecord,
  type PnlRecord,
} from '../repositories/pnlRepo.js';
import { getPositionsSnapshot } from './positionsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');
const REVENUE_JSON_PATH = path.join(DATA_DIR, 'revenue_overview.json');

function getIncomeBaselinesPath(): string {
  return path.join(getPnlDataDir(), 'income_baselines.json');
}

function readRevenueJson(): any | null {
  try {
    return JSON.parse(fs.readFileSync(REVENUE_JSON_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function writeRevenueJson(data: any): void {
  fs.writeFileSync(REVENUE_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function readIncomeBaselines(): any | null {
  try {
    return JSON.parse(fs.readFileSync(getIncomeBaselinesPath(), 'utf-8'));
  } catch {
    return null;
  }
}

function writeIncomeBaselines(data: any): void {
  const p = getIncomeBaselinesPath();
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, p);
}

function upsertIncomeDailySnapshot(
  date: string,
  values: { uniswap: number; morpho: number; hlp: number },
  base: { uniswap: number; morpho: number; hlp: number }
) {
  const bl = readIncomeBaselines();
  if (!bl) return;
  const pnlUniswap = Math.max(0, values.uniswap - base.uniswap);
  const pnlMorpho = Math.max(0, values.morpho - base.morpho);
  const pnlHlp = values.hlp - base.hlp;
  const entry = {
    date,
    uniswap: values.uniswap,
    morpho: values.morpho,
    hlp: values.hlp,
    pnlUniswap,
    pnlMorpho,
    pnlHlp,
    pnlTotal: pnlUniswap + pnlMorpho + pnlHlp,
  };
  const daily: any[] = bl.dailyUpdates || [];
  const idx = daily.findIndex((d: any) => d.date === date);
  if (idx >= 0) daily[idx] = entry;
  else daily.push(entry);
  bl.dailyUpdates = daily;
  writeIncomeBaselines(bl);
}

export function getTodayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

export function diffDaysUtc(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

export function recalcByPnl(startingCapital: number, pnl: number, days: number) {
  const endingCapital = startingCapital + pnl;
  const returnRate = startingCapital > 0 ? pnl / startingCapital : 0;
  const annualizedReturn = days > 0 ? (returnRate / days) * 365 : 0;
  return { endingCapital, returnRate, annualizedReturn };
}

function bakeWeeklyPnlIntoMonthly(settledWeeklyPnl: number, weekEndDate: string) {
  const monthlyPending = getLatestPnlRecord('monthly', 'pending');
  if (!monthlyPending) return;

  const newBase = (monthlyPending.basePnl || 0) + settledWeeklyPnl;
  const nextDays = diffDaysUtc(monthlyPending.startDate, weekEndDate);
  const metrics = recalcByPnl(monthlyPending.startingCapital, newBase, nextDays);
  updateRecord(monthlyPending.id, {
    basePnl: newBase,
    pnl: newBase,
    endDate: weekEndDate,
    days: nextDays,
    annualizedReturn: metrics.annualizedReturn,
    returnRate: metrics.returnRate,
    endingCapital: metrics.endingCapital,
  });
}

function syncMonthlyPendingFromWeekly(targetEndDate: string) {
  const monthlyPending = getLatestPnlRecord('monthly', 'pending');
  if (!monthlyPending) return;

  const monthStart = monthlyPending.startDate;
  const nextMonthStart = new Date(new Date(`${monthStart}T00:00:00Z`).setUTCMonth(new Date(`${monthStart}T00:00:00Z`).getUTCMonth() + 1))
    .toISOString()
    .slice(0, 10);

  const pendingWeekly = listPnlRecords('weekly').find(
    (r) => r.status === 'pending' && r.startDate >= monthStart && r.startDate < nextMonthStart
  );

  const pendingPnl = pendingWeekly ? pendingWeekly.pnl || 0 : 0;
  const finalEndDate = (pendingWeekly?.endDate || targetEndDate) > targetEndDate
    ? (pendingWeekly?.endDate || targetEndDate)
    : targetEndDate;
  const totalPnl = (monthlyPending.basePnl || 0) + pendingPnl;
  const nextDays = diffDaysUtc(monthStart, finalEndDate);
  const metrics = recalcByPnl(monthlyPending.startingCapital, totalPnl, nextDays);

  updateRecord(monthlyPending.id, {
    endDate: finalEndDate,
    days: nextDays,
    pnl: totalPnl,
    annualizedReturn: metrics.annualizedReturn,
    returnRate: metrics.returnRate,
    endingCapital: metrics.endingCapital,
  });
}

export function formatPnlRecord(record: PnlRecord | undefined) {
  if (!record) return null;
  return {
    id: record.id,
    period: record.period,
    startDate: record.startDate,
    endDate: record.endDate,
    startingCapital: record.startingCapital,
    endingCapital: record.endingCapital,
    pnl: record.pnl,
    returnRate: record.returnRate,
    days: record.days,
    annualizedReturn: record.annualizedReturn,
    isAdjusted: false,
    status: record.status,
    autoAccumulate: !!record.autoAccumulate,
    editable: !!record.editable,
    incomeUniswap: record.incomeUniswap || 0,
    incomeMorpho: record.incomeMorpho || 0,
    incomeHlp: record.incomeHlp || 0,
    incomeTotal: record.incomeTotal || 0,
    lastAutoUpdateAt: record.lastAutoUpdateAt || null,
    basePnl: record.basePnl != null ? Number(record.basePnl) : 0,
    lastUniswapValue: record.lastUniswapValue || 0,
    lastMorphoValue: record.lastMorphoValue || 0,
    lastHlpValue: record.lastHlpValue || 0,
  };
}

export function formatRevenue(record: any) {
  return {
    id: record.id,
    periodLabel: record.periodLabel,
    startDate: record.startDate,
    endDate: record.endDate || '',
    initialInvestment: record.initialInvestment,
    fairValue: record.fairValue,
    cashValue: record.cashValue,
    profit: record.profit,
    returnRate: record.returnRate,
    runningDays: record.runningDays,
    annualizedReturn: record.annualizedReturn,
  };
}

async function fetchIncomeBaseline(force = false) {
  const snapshot = await getPositionsSnapshot({ force });
  return snapshot.incomeBreakdown;
}

export async function createWeeklyPnlRecord(input: {
  startDate: string;
  startingCapital?: number;
  endDate?: string;
  pnl?: number;
  days?: number;
}) {
  const latestDone = getLatestNonInProgressWeekly();
  const weeklyPending = getLatestPnlRecord('weekly', 'pending');

  // New week starts from the settled week's ending capital (pending takes priority over latestDone)
  const baselineRecord = weeklyPending || latestDone;
  const resolvedStartingCapital =
    input.startingCapital != null
      ? Number(input.startingCapital)
      : baselineRecord
        ? Number(baselineRecord.endingCapital)
        : null;

  if (resolvedStartingCapital == null || !Number.isFinite(resolvedStartingCapital)) {
    throw new Error('Missing startingCapital and no latest done weekly record to infer from');
  }

  const today = getTodayUtcDate();
  const finalEndDate = input.endDate || today;
  const resolvedDays = input.days != null ? Number(input.days) : diffDaysUtc(input.startDate, finalEndDate);
  const resolvedPnl = input.pnl != null ? Number(input.pnl) : 0;
  const metrics = recalcByPnl(resolvedStartingCapital, resolvedPnl, resolvedDays);
  const id = uuidv4();

  const creatingHistoricalDone = !!input.endDate && (input.pnl != null || input.days != null);
  const status = creatingHistoricalDone ? 'done' : 'pending';

  // Fetch income BEFORE settling the old pending — if this fails, the old pending stays intact
  const income = await fetchIncomeBaseline(!creatingHistoricalDone);

  if (weeklyPending) {
    updateRecord(weeklyPending.id, { status: 'done', autoAccumulate: false, editable: false });
    bakeWeeklyPnlIntoMonthly(weeklyPending.pnl || 0, weeklyPending.endDate || today);
  }

  const record: PnlRecord = {
    id,
    period: 'weekly',
    startDate: input.startDate,
    endDate: finalEndDate,
    startingCapital: resolvedStartingCapital,
    endingCapital: metrics.endingCapital,
    pnl: resolvedPnl,
    returnRate: metrics.returnRate,
    days: resolvedDays,
    annualizedReturn: metrics.annualizedReturn,
    status,
    autoAccumulate: !creatingHistoricalDone,
    editable: !creatingHistoricalDone,
    incomeUniswap: 0,
    incomeMorpho: 0,
    incomeHlp: 0,
    incomeTotal: 0,
    lastUniswapValue: income.uniswap,
    lastMorphoValue: income.morpho,
    lastHlpValue: income.hlp,
    lastAutoUpdateAt: today,
    basePnl: 0,
  };

  insertRecord(record);

  // Update income_baselines.json with new week's base
  if (!creatingHistoricalDone) {
    const newBase = {
      weeklyId: id,
      weekStart: input.startDate,
      uniswap: income.uniswap,
      morpho: income.morpho,
      hlp: income.hlp,
      recordedAt: today,
    };
    writeIncomeBaselines({ currentWeeklyId: id, base: newBase, dailyUpdates: [] });
  }

  syncMonthlyPendingFromWeekly(finalEndDate);
  return formatPnlRecord(getPnlRecordById(id));
}

export async function createMonthlyPnlRecord(input: {
  month: string;
  startingCapital?: number;
  pnl?: number;
  days?: number;
  auto?: boolean;
  endDate?: string;
}) {
  const startDate = `${input.month}-01`;
  const defaultDays = diffDaysUtc(startDate, getTodayUtcDate());
  const finalDays = input.days ? Number(input.days) : defaultDays;
  const finalPnl = input.pnl != null ? Number(input.pnl) : 0;
  const resolvedEndDate =
    input.endDate ||
    new Date(new Date(`${startDate}T00:00:00Z`).getTime() + finalDays * 86400000).toISOString().slice(0, 10);

  const latestDoneMonthly = getLatestPnlRecord('monthly', 'done');
  const revenue = readRevenueJson();
  const resolvedStartingCapital =
    input.startingCapital != null
      ? Number(input.startingCapital)
      : latestDoneMonthly
        ? Number(latestDoneMonthly.endingCapital)
        : revenue
          ? Number(revenue.initialInvestment)
          : null;

  if (resolvedStartingCapital == null || !Number.isFinite(resolvedStartingCapital)) {
    throw new Error('Missing startingCapital and no baseline to infer from');
  }

  const metrics = recalcByPnl(resolvedStartingCapital, finalPnl, finalDays);
  const id = uuidv4();

  if (input.auto) {
    const currentMonthlyPending = getLatestPnlRecord('monthly', 'pending');
    if (currentMonthlyPending) {
      updateRecord(currentMonthlyPending.id, { status: 'done', autoAccumulate: false, editable: false });
    }
  }

  const income = await fetchIncomeBaseline(!input.endDate);
  const record: PnlRecord = {
    id,
    period: 'monthly',
    startDate,
    endDate: resolvedEndDate,
    startingCapital: resolvedStartingCapital,
    endingCapital: metrics.endingCapital,
    pnl: finalPnl,
    returnRate: metrics.returnRate,
    days: finalDays,
    annualizedReturn: metrics.annualizedReturn,
    status: input.auto ? 'pending' : 'done',
    autoAccumulate: !!input.auto,
    editable: !!input.auto,
    incomeUniswap: 0,
    incomeMorpho: 0,
    incomeHlp: 0,
    incomeTotal: 0,
    lastUniswapValue: income.uniswap,
    lastMorphoValue: income.morpho,
    lastHlpValue: income.hlp,
    lastAutoUpdateAt: getTodayUtcDate(),
    basePnl: 0,
  };

  insertRecord(record);
  return formatPnlRecord(getPnlRecordById(id));
}


export function updateRevenueOverview(data: {
  periodLabel: string;
  startDate: string;
  endDate: string;
  initialInvestment: number;
  fairValue: number;
  cashValue: number;
}) {
  const existing = readRevenueJson();
  const id = existing?.id || uuidv4();
  const profit = data.fairValue - data.initialInvestment;
  const runningDays = diffDaysUtc(data.startDate, data.endDate);
  const returnRate = data.initialInvestment > 0 ? profit / data.initialInvestment : 0;
  const annualizedReturn = runningDays > 0 ? (returnRate / runningDays) * 365 : 0;

  const record = {
    id,
    periodLabel: data.periodLabel,
    startDate: data.startDate,
    endDate: data.endDate,
    initialInvestment: data.initialInvestment,
    fairValue: data.fairValue,
    cashValue: data.cashValue,
    profit,
    returnRate,
    runningDays,
    annualizedReturn,
  };
  writeRevenueJson(record);
  return formatRevenue(record);
}

export function getRevenueOverview() {
  const overview = readRevenueJson();
  return overview ? formatRevenue(overview) : null;
}

export function updatePnlRecordById(id: string, data: any) {
  const existing = getPnlRecordById(id);
  if (!existing) return null;

  const nextStartingCapital = data.startingCapital ?? existing.startingCapital;
  const nextPnl = data.pnl ?? existing.pnl;
  const nextDays = data.days ?? existing.days;
  const computed = recalcByPnl(nextStartingCapital, nextPnl, nextDays);
  const nextEndingCapital = data.endingCapital ?? computed.endingCapital;
  const nextReturnRate = data.returnRate ?? computed.returnRate;
  const nextAnnualizedReturn = data.annualizedReturn ?? computed.annualizedReturn;

  const isPending = existing.status === 'pending';

  const updated = updateRecord(id, {
    startDate: data.startDate ?? existing.startDate,
    endDate: data.endDate ?? existing.endDate,
    startingCapital: nextStartingCapital,
    endingCapital: nextEndingCapital,
    pnl: nextPnl,
    returnRate: nextReturnRate,
    days: nextDays,
    annualizedReturn: nextAnnualizedReturn,
    status: isPending ? 'pending' : 'done',
    autoAccumulate: isPending,
    editable: isPending,
    lastUniswapValue: data.lastUniswapValue ?? existing.lastUniswapValue,
    lastMorphoValue: data.lastMorphoValue ?? existing.lastMorphoValue,
    lastHlpValue: data.lastHlpValue ?? existing.lastHlpValue,
  });

  if (existing.period === 'weekly') {
    syncMonthlyPendingFromWeekly(data.endDate || updated?.endDate || existing.endDate);
  }
  return formatPnlRecord(updated);
}

export function deletePnlRecordById(id: string): boolean {
  return deleteRecord(id);
}

export async function runDailyPnlAutoAccumulate(today = getTodayUtcDate()) {
  const records = listInProgressPnlRecords();
  if (records.length === 0) return { updated: 0 };

  let income;
  try {
    income = await fetchIncomeBaseline(true);
  } catch (error: any) {
    console.error('[PnL] Daily accumulate skipped: could not fetch income breakdown', error.message);
    return { updated: 0 };
  }

  let updated = 0;
  for (const record of records) {
    if (record.lastAutoUpdateAt === today) continue;

    const weekUniswap = Math.max(0, income.uniswap - (record.lastUniswapValue || 0));
    const weekMorpho = Math.max(0, income.morpho - (record.lastMorphoValue || 0));
    const weekHlp = income.hlp - (record.lastHlpValue || 0);
    const nextPnl = weekUniswap + weekMorpho + weekHlp;
    const days = diffDaysUtc(record.startDate, today);
    const metrics = recalcByPnl(record.startingCapital, nextPnl, days);

    updateRecord(record.id, {
      endDate: today,
      pnl: nextPnl,
      endingCapital: metrics.endingCapital,
      returnRate: metrics.returnRate,
      days,
      annualizedReturn: metrics.annualizedReturn,
      incomeUniswap: weekUniswap,
      incomeMorpho: weekMorpho,
      incomeHlp: weekHlp,
      incomeTotal: nextPnl,
      lastAutoUpdateAt: today,
    });
    updated += 1;
  }

  if (updated > 0) {
    syncMonthlyPendingFromWeekly(today);
    // Write daily snapshot to income_baselines.json
    const bl = readIncomeBaselines();
    if (bl) {
      const base = { uniswap: bl.base?.uniswap ?? 0, morpho: bl.base?.morpho ?? 0, hlp: bl.base?.hlp ?? 0 };
      upsertIncomeDailySnapshot(today, { uniswap: income.uniswap, morpho: income.morpho, hlp: income.hlp }, base);
    }
  }
  return { updated };
}

export function getWeeklyPnlRecords(filters: { from?: string; to?: string }) {
  return listPnlRecords('weekly', filters.from, filters.to).map(formatPnlRecord);
}

export function getMonthlyPnlRecords(filters: { from?: string; to?: string }) {
  return listPnlRecords('monthly', filters.from, filters.to).map(formatPnlRecord);
}
