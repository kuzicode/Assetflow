import { v4 as uuidv4 } from 'uuid';
import { db, getLatestNonInProgressWeekly, getLatestPnlRecord, getPnlRecordById, listInProgressPnlRecords, listPnlRecords } from '../repositories/pnlRepo.js';
import { getLatestSnapshots } from '../repositories/snapshotsRepo.js';
import { getPositionsSnapshot } from './positionsService.js';

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
  const monthlyInProgress: any = getLatestPnlRecord('monthly', 'in_progress');
  if (!monthlyInProgress) return;

  const newBase = (monthlyInProgress.base_pnl || 0) + settledWeeklyPnl;
  const nextDays = diffDaysUtc(monthlyInProgress.start_date, weekEndDate);
  const metrics = recalcByPnl(monthlyInProgress.starting_capital, newBase, nextDays);
  db.prepare(`
    UPDATE pnl_records
    SET base_pnl = ?, pnl = ?, end_date = ?, days = ?,
        annualized_return = ?, return_rate = ?, ending_capital = ?
    WHERE id = ?
  `).run(newBase, newBase, weekEndDate, nextDays, metrics.annualizedReturn, metrics.returnRate, metrics.endingCapital, monthlyInProgress.id);
}

function syncMonthlyInProgressFromWeekly(targetEndDate: string) {
  const monthlyInProgress: any = getLatestPnlRecord('monthly', 'in_progress');
  if (!monthlyInProgress) return;

  const monthStart = monthlyInProgress.start_date;
  const nextMonthStart = new Date(new Date(`${monthStart}T00:00:00Z`).setUTCMonth(new Date(`${monthStart}T00:00:00Z`).getUTCMonth() + 1))
    .toISOString()
    .slice(0, 10);

  const inProgressWeekly: any = db.prepare(`
    SELECT * FROM pnl_records
    WHERE period = 'weekly' AND status = 'in_progress'
      AND start_date >= ? AND start_date < ?
    ORDER BY start_date DESC LIMIT 1
  `).get(monthStart, nextMonthStart);

  const inProgressPnl = inProgressWeekly ? inProgressWeekly.pnl || 0 : 0;
  const finalEndDate = (inProgressWeekly?.end_date || targetEndDate) > targetEndDate
    ? (inProgressWeekly?.end_date || targetEndDate)
    : targetEndDate;
  const totalPnl = (monthlyInProgress.base_pnl || 0) + inProgressPnl;
  const nextDays = diffDaysUtc(monthStart, finalEndDate);
  const metrics = recalcByPnl(monthlyInProgress.starting_capital, totalPnl, nextDays);

  db.prepare(`
    UPDATE pnl_records
    SET end_date = ?, days = ?, pnl = ?, annualized_return = ?, return_rate = ?, ending_capital = ?
    WHERE id = ?
  `).run(finalEndDate, nextDays, totalPnl, metrics.annualizedReturn, metrics.returnRate, metrics.endingCapital, monthlyInProgress.id);
}

export function formatPnlRecord(record: any) {
  return {
    id: record.id,
    period: record.period,
    startDate: record.start_date,
    endDate: record.end_date,
    startingCapital: record.starting_capital,
    endingCapital: record.ending_capital,
    pnl: record.pnl,
    returnRate: record.return_rate,
    days: record.days,
    annualizedReturn: record.annualized_return,
    isAdjusted: !!record.is_adjusted,
    status: record.status || 'settled',
    autoAccumulate: !!record.auto_accumulate,
    editable: !!record.editable,
    incomeUniswap: record.income_uniswap || 0,
    incomeMorpho: record.income_morpho || 0,
    incomeHlp: record.income_hlp || 0,
    incomeTotal: record.income_total || 0,
    lastAutoUpdateAt: record.last_auto_update_at || null,
    basePnl: record.base_pnl != null ? Number(record.base_pnl) : 0,
    lastUniswapValue: record.last_uniswap_value || 0,
    lastMorphoValue: record.last_morpho_value || 0,
    lastHlpValue: record.last_hlp_value || 0,
  };
}

export function formatRevenue(record: any) {
  return {
    id: record.id,
    periodLabel: record.period_label,
    startDate: record.start_date,
    initialInvestment: record.initial_investment,
    fairValue: record.fair_value,
    cashValue: record.cash_value,
    profit: record.profit,
    returnRate: record.return_rate,
    runningDays: record.running_days,
    annualizedReturn: record.annualized_return,
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
  const latestSettled = getLatestNonInProgressWeekly();
  const resolvedStartingCapital =
    input.startingCapital != null
      ? Number(input.startingCapital)
      : latestSettled
        ? Number(latestSettled.ending_capital)
        : null;

  if (resolvedStartingCapital == null || !Number.isFinite(resolvedStartingCapital)) {
    throw new Error('Missing startingCapital and no latest settled weekly record to infer from');
  }

  if (latestSettled && Number(resolvedStartingCapital) !== Number(latestSettled.ending_capital)) {
    throw new Error('startingCapital must equal latest settled weekly endingCapital');
  }

  const today = getTodayUtcDate();
  const finalEndDate = input.endDate || today;
  const resolvedDays = input.days != null ? Number(input.days) : diffDaysUtc(input.startDate, finalEndDate);
  const resolvedPnl = input.pnl != null ? Number(input.pnl) : 0;
  const metrics = recalcByPnl(resolvedStartingCapital, resolvedPnl, resolvedDays);
  const id = uuidv4();
  const weeklyInProgress = getLatestPnlRecord('weekly', 'in_progress');

  if (weeklyInProgress) {
    db.prepare("UPDATE pnl_records SET status = 'settled', auto_accumulate = 0, editable = 0 WHERE id = ?").run(weeklyInProgress.id);
    bakeWeeklyPnlIntoMonthly(weeklyInProgress.pnl || 0, weeklyInProgress.end_date || today);
  }

  const creatingHistoricalSettled = !!input.endDate && (input.pnl != null || input.days != null);
  const status = creatingHistoricalSettled ? 'settled' : 'in_progress';
  const autoAccumulate = creatingHistoricalSettled ? 0 : 1;
  const editable = creatingHistoricalSettled ? 0 : 1;
  const isAdjusted = creatingHistoricalSettled ? 1 : 0;
  const income = await fetchIncomeBaseline(!creatingHistoricalSettled);

  db.prepare(`
    INSERT INTO pnl_records (
      id, period, start_date, end_date, starting_capital, ending_capital,
      pnl, return_rate, days, annualized_return, is_adjusted, status, auto_accumulate, editable,
      income_uniswap, income_morpho, income_hlp, income_total,
      last_uniswap_value, last_morpho_value, last_hlp_value, last_auto_update_at
    )
    VALUES (?, 'weekly', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?)
  `).run(
    id,
    input.startDate,
    finalEndDate,
    resolvedStartingCapital,
    metrics.endingCapital,
    resolvedPnl,
    metrics.returnRate,
    resolvedDays,
    metrics.annualizedReturn,
    isAdjusted,
    status,
    autoAccumulate,
    editable,
    income.uniswap,
    income.morpho,
    income.hlp,
    today
  );

  syncMonthlyInProgressFromWeekly(finalEndDate);
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

  const latestLockedMonthly: any = getLatestPnlRecord('monthly', 'locked');
  const revenue: any = db.prepare('SELECT * FROM revenue_overview LIMIT 1').get();
  const resolvedStartingCapital =
    input.startingCapital != null
      ? Number(input.startingCapital)
      : latestLockedMonthly
        ? Number(latestLockedMonthly.ending_capital)
        : revenue
          ? Number(revenue.initial_investment)
          : null;

  if (resolvedStartingCapital == null || !Number.isFinite(resolvedStartingCapital)) {
    throw new Error('Missing startingCapital and no baseline to infer from');
  }

  const metrics = recalcByPnl(resolvedStartingCapital, finalPnl, finalDays);
  const id = uuidv4();

  if (input.auto) {
    const currentMonthly = getLatestPnlRecord('monthly', 'in_progress');
    if (currentMonthly) {
      db.prepare("UPDATE pnl_records SET status = 'locked', auto_accumulate = 0, editable = 0 WHERE id = ?").run(currentMonthly.id);
    }
  }

  const income = await fetchIncomeBaseline(!input.endDate);
  db.prepare(`
    INSERT INTO pnl_records (
      id, period, start_date, end_date, starting_capital, ending_capital, pnl, return_rate, days, annualized_return, is_adjusted,
      status, auto_accumulate, editable, income_uniswap, income_morpho, income_hlp, income_total,
      last_uniswap_value, last_morpho_value, last_hlp_value, last_auto_update_at
    )
    VALUES (?, 'monthly', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?)
  `).run(
    id,
    startDate,
    resolvedEndDate,
    resolvedStartingCapital,
    metrics.endingCapital,
    finalPnl,
    metrics.returnRate,
    finalDays,
    metrics.annualizedReturn,
    input.auto ? 'in_progress' : 'locked',
    input.auto ? 1 : 0,
    input.auto ? 1 : 0,
    income.uniswap,
    income.morpho,
    income.hlp,
    getTodayUtcDate()
  );

  return formatPnlRecord(getPnlRecordById(id));
}

export function calculatePnlFromSnapshots(period: 'weekly' | 'monthly') {
  const snapshots = getLatestSnapshots(2);
  if (snapshots.length < 2) {
    throw new Error('Need at least 2 snapshots to calculate P&L');
  }

  const [latest, previous] = snapshots;
  const startDate = previous.timestamp.split('T')[0];
  const endDate = latest.timestamp.split('T')[0];
  const days = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000));
  const startingCapital = previous.total_fair_value;
  const endingCapital = latest.total_fair_value;
  const pnl = endingCapital - startingCapital;
  const returnRate = startingCapital > 0 ? pnl / startingCapital : 0;
  const annualizedReturn = (returnRate / days) * 365;
  const id = uuidv4();

  db.prepare(`
    INSERT INTO pnl_records (
      id, period, start_date, end_date, starting_capital, ending_capital, pnl, return_rate, days, annualized_return,
      status, auto_accumulate, editable
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'settled', 0, 0)
  `).run(id, period, startDate, endDate, startingCapital, endingCapital, pnl, returnRate, days, annualizedReturn);

  return formatPnlRecord(getPnlRecordById(id));
}

export function updateRevenueOverview(data: {
  periodLabel: string;
  startDate: string;
  initialInvestment: number;
  fairValue: number;
  cashValue: number;
  profit: number;
  returnRate: number;
  runningDays: number;
  annualizedReturn: number;
}) {
  const existing: any = db.prepare('SELECT * FROM revenue_overview LIMIT 1').get();
  const id = existing?.id || uuidv4();
  db.prepare(`
    INSERT INTO revenue_overview (id, period_label, start_date, initial_investment, fair_value, cash_value, profit, return_rate, running_days, annualized_return)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      period_label = excluded.period_label,
      start_date = excluded.start_date,
      initial_investment = excluded.initial_investment,
      fair_value = excluded.fair_value,
      cash_value = excluded.cash_value,
      profit = excluded.profit,
      return_rate = excluded.return_rate,
      running_days = excluded.running_days,
      annualized_return = excluded.annualized_return
  `).run(id, data.periodLabel, data.startDate, data.initialInvestment, data.fairValue, data.cashValue, data.profit, data.returnRate, data.runningDays, data.annualizedReturn);

  return formatRevenue(db.prepare('SELECT * FROM revenue_overview WHERE id = ?').get(id));
}

export function getRevenueOverview() {
  const overview = db.prepare('SELECT * FROM revenue_overview LIMIT 1').get();
  return overview ? formatRevenue(overview) : null;
}

export function updatePnlRecordById(id: string, data: any) {
  const existing = getPnlRecordById(id);
  if (!existing) return null;

  const nextStartingCapital = data.startingCapital ?? existing.starting_capital;
  const nextPnl = data.pnl ?? existing.pnl;
  const nextDays = data.days ?? existing.days;
  const computed = recalcByPnl(nextStartingCapital, nextPnl, nextDays);
  const nextEndingCapital = data.endingCapital ?? computed.endingCapital;
  const nextReturnRate = data.returnRate ?? computed.returnRate;
  const nextAnnualizedReturn = data.annualizedReturn ?? computed.annualizedReturn;

  const monthlyStillInProgress = existing.period === 'monthly' && existing.status === 'in_progress';
  const nextStatus =
    existing.period === 'monthly'
      ? (monthlyStillInProgress ? 'in_progress' : 'locked')
      : (existing.status === 'in_progress' ? 'in_progress' : 'settled');
  const nextActive = existing.period === 'monthly'
    ? (monthlyStillInProgress ? 1 : 0)
    : (existing.status === 'in_progress' ? 1 : 0);

  db.prepare(`
    UPDATE pnl_records SET
      start_date = COALESCE(?, start_date),
      end_date = COALESCE(?, end_date),
      starting_capital = ?,
      ending_capital = ?,
      pnl = ?,
      return_rate = ?,
      days = ?,
      annualized_return = ?,
      status = ?,
      auto_accumulate = ?,
      editable = ?,
      is_adjusted = 1,
      last_uniswap_value = COALESCE(?, last_uniswap_value),
      last_morpho_value = COALESCE(?, last_morpho_value),
      last_hlp_value = COALESCE(?, last_hlp_value)
    WHERE id = ?
  `).run(
    data.startDate ?? null,
    data.endDate ?? null,
    nextStartingCapital,
    nextEndingCapital,
    nextPnl,
    nextReturnRate,
    nextDays,
    nextAnnualizedReturn,
    nextStatus,
    nextActive,
    nextActive,
    data.lastUniswapValue ?? null,
    data.lastMorphoValue ?? null,
    data.lastHlpValue ?? null,
    id
  );

  const updated = getPnlRecordById(id);
  if (existing.period === 'weekly' && (data.endDate || updated?.end_date)) {
    syncMonthlyInProgressFromWeekly(data.endDate || updated.end_date);
  }
  return formatPnlRecord(updated);
}

export function deletePnlRecordById(id: string) {
  return db.prepare('DELETE FROM pnl_records WHERE id = ?').run(id);
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
    if (record.last_auto_update_at === today) continue;

    const weekUniswap = Math.max(0, income.uniswap - (record.last_uniswap_value || 0));
    const weekMorpho = Math.max(0, income.morpho - (record.last_morpho_value || 0));
    const weekHlp = Math.max(0, income.hlp - (record.last_hlp_value || 0));
    const nextPnl = weekUniswap + weekMorpho + weekHlp;
    const days = diffDaysUtc(record.start_date, today);
    const metrics = recalcByPnl(record.starting_capital, nextPnl, days);

    db.prepare(`
      UPDATE pnl_records SET
        end_date = ?,
        pnl = ?,
        ending_capital = ?,
        return_rate = ?,
        days = ?,
        annualized_return = ?,
        income_uniswap = ?,
        income_morpho = ?,
        income_hlp = ?,
        income_total = ?,
        last_auto_update_at = ?
      WHERE id = ?
    `).run(today, nextPnl, metrics.endingCapital, metrics.returnRate, days, metrics.annualizedReturn, weekUniswap, weekMorpho, weekHlp, nextPnl, today, record.id);
    updated += 1;
  }

  if (updated > 0) syncMonthlyInProgressFromWeekly(today);
  return { updated };
}

export function getWeeklyPnlRecords(filters: { from?: string; to?: string }) {
  return listPnlRecords('weekly', filters.from, filters.to).map(formatPnlRecord);
}

export function getMonthlyPnlRecords(filters: { from?: string; to?: string }) {
  return listPnlRecords('monthly', filters.from, filters.to).map(formatPnlRecord);
}
