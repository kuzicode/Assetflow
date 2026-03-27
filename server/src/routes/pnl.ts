import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import { fetchPositionsAggregate } from './positions.js';

const router = Router();
ensurePnlRecordColumns();

function getTodayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function toUtcDateStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function diffDaysUtc(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function recalcByPnl(startingCapital: number, pnl: number, days: number) {
  const endingCapital = startingCapital + pnl;
  const returnRate = startingCapital > 0 ? pnl / startingCapital : 0;
  const annualizedReturn = days > 0 ? returnRate / days * 365 : 0;
  return { endingCapital, returnRate, annualizedReturn };
}

function syncMonthlyInProgressEndDate(targetEndDate: string) {
  const monthlyInProgress: any = db.prepare(
    "SELECT * FROM pnl_records WHERE period = 'monthly' AND status = 'in_progress' ORDER BY start_date DESC LIMIT 1"
  ).get();
  if (!monthlyInProgress) return;
  if (!monthlyInProgress.end_date || monthlyInProgress.end_date >= targetEndDate) return;

  const nextDays = diffDaysUtc(monthlyInProgress.start_date, targetEndDate);
  const metrics = recalcByPnl(monthlyInProgress.starting_capital, monthlyInProgress.pnl || 0, nextDays);
  db.prepare(`
    UPDATE pnl_records
    SET end_date = ?, days = ?, annualized_return = ?, return_rate = ?, ending_capital = ?
    WHERE id = ?
  `).run(
    targetEndDate,
    nextDays,
    metrics.annualizedReturn,
    metrics.returnRate,
    metrics.endingCapital,
    monthlyInProgress.id
  );
}

function ensurePnlRecordColumns() {
  const columns: any[] = db.prepare("PRAGMA table_info('pnl_records')").all();
  const existing = new Set(columns.map((c) => c.name));
  const alters: string[] = [];
  const add = (name: string, sql: string) => {
    if (!existing.has(name)) alters.push(sql);
  };
  add('status', "ALTER TABLE pnl_records ADD COLUMN status TEXT NOT NULL DEFAULT 'settled'");
  add('auto_accumulate', 'ALTER TABLE pnl_records ADD COLUMN auto_accumulate INTEGER NOT NULL DEFAULT 0');
  add('editable', 'ALTER TABLE pnl_records ADD COLUMN editable INTEGER NOT NULL DEFAULT 0');
  add('income_uniswap', 'ALTER TABLE pnl_records ADD COLUMN income_uniswap REAL NOT NULL DEFAULT 0');
  add('income_morpho', 'ALTER TABLE pnl_records ADD COLUMN income_morpho REAL NOT NULL DEFAULT 0');
  add('income_hlp', 'ALTER TABLE pnl_records ADD COLUMN income_hlp REAL NOT NULL DEFAULT 0');
  add('income_total', 'ALTER TABLE pnl_records ADD COLUMN income_total REAL NOT NULL DEFAULT 0');
  add('last_uniswap_value', 'ALTER TABLE pnl_records ADD COLUMN last_uniswap_value REAL NOT NULL DEFAULT 0');
  add('last_morpho_value', 'ALTER TABLE pnl_records ADD COLUMN last_morpho_value REAL NOT NULL DEFAULT 0');
  add('last_hlp_value', 'ALTER TABLE pnl_records ADD COLUMN last_hlp_value REAL NOT NULL DEFAULT 0');
  add('last_auto_update_at', 'ALTER TABLE pnl_records ADD COLUMN last_auto_update_at TEXT');

  for (const sql of alters) db.exec(sql);
  db.exec("UPDATE pnl_records SET status = 'settled' WHERE status IS NULL OR status = ''");
}

// GET /api/pnl/weekly
router.get('/weekly', (req, res) => {
  const { from, to } = req.query;
  let sql = "SELECT * FROM pnl_records WHERE period = 'weekly'";
  const params: any[] = [];

  if (from) { sql += ' AND start_date >= ?'; params.push(from); }
  if (to) { sql += ' AND end_date <= ?'; params.push(to); }
  sql += ' ORDER BY start_date DESC';

  const records = db.prepare(sql).all(...params);
  res.json(records.map(formatPnlRecord));
});

// GET /api/pnl/monthly
router.get('/monthly', (req, res) => {
  const { from, to } = req.query;
  let sql = "SELECT * FROM pnl_records WHERE period = 'monthly'";
  const params: any[] = [];

  if (from) { sql += ' AND start_date >= ?'; params.push(from); }
  if (to) { sql += ' AND end_date <= ?'; params.push(to); }
  sql += ' ORDER BY start_date DESC';

  const records = db.prepare(sql).all(...params);
  res.json(records.map(formatPnlRecord));
});

// POST /api/pnl/weekly - 创建周度进行中记录，并结算上一条周度进行中记录
router.post('/weekly', async (req, res) => {
  const { startDate, startingCapital, endDate, pnl, days } = req.body;
  if (!startDate) {
    return res.status(400).json({ error: 'Missing required fields: startDate' });
  }

  const latestSettled: any = db.prepare(
    "SELECT * FROM pnl_records WHERE period = 'weekly' AND status != 'in_progress' ORDER BY start_date DESC LIMIT 1"
  ).get();

  const resolvedStartingCapital =
    startingCapital != null
      ? Number(startingCapital)
      : (latestSettled ? Number(latestSettled.ending_capital) : null);

  if (resolvedStartingCapital == null || !Number.isFinite(resolvedStartingCapital)) {
    return res.status(400).json({ error: 'Missing startingCapital and no latest settled weekly record to infer from' });
  }

  if (latestSettled && Number(resolvedStartingCapital) !== Number(latestSettled.ending_capital)) {
    return res.status(400).json({ error: 'startingCapital must equal latest settled weekly endingCapital' });
  }

  const today = getTodayUtcDate();
  const finalEndDate = endDate || today;
  const resolvedDays = days != null ? Number(days) : diffDaysUtc(startDate, finalEndDate);
  const resolvedPnl = pnl != null ? Number(pnl) : 0;
  const metrics = recalcByPnl(resolvedStartingCapital, resolvedPnl, resolvedDays);
  const id = uuidv4();

  const weeklyInProgress: any = db.prepare(
    "SELECT * FROM pnl_records WHERE period = 'weekly' AND status = 'in_progress' ORDER BY start_date DESC LIMIT 1"
  ).get();
  if (weeklyInProgress) {
    db.prepare(`
      UPDATE pnl_records
      SET status = 'settled', auto_accumulate = 0, editable = 0
      WHERE id = ?
    `).run(weeklyInProgress.id);
  }

  const creatingHistoricalSettled = !!endDate && (pnl != null || days != null);
  const status = creatingHistoricalSettled ? 'settled' : 'in_progress';
  const autoAccumulate = creatingHistoricalSettled ? 0 : 1;
  const editable = creatingHistoricalSettled ? 0 : 1;
  const isAdjusted = creatingHistoricalSettled ? 1 : 0;
  const income = await fetchIncomeBreakdownSafe();

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
    startDate,
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

  const created = db.prepare('SELECT * FROM pnl_records WHERE id = ?').get(id) as any;
  syncMonthlyInProgressEndDate(finalEndDate);
  res.json(formatPnlRecord(created));
});

// POST /api/pnl/calculate - 从最近快照计算 P&L
router.post('/calculate', (req, res) => {
  const { period } = req.body; // 'weekly' | 'monthly'
  if (!period || !['weekly', 'monthly'].includes(period)) {
    return res.status(400).json({ error: 'Invalid period' });
  }

  const snapshots: any[] = db.prepare(
    'SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT 2'
  ).all();

  if (snapshots.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 snapshots to calculate P&L' });
  }

  const [latest, previous] = snapshots;
  const startDate = previous.timestamp.split('T')[0];
  const endDate = latest.timestamp.split('T')[0];
  const days = Math.max(1, Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
  ));

  const startingCapital = previous.total_fair_value;
  const endingCapital = latest.total_fair_value;
  const pnl = endingCapital - startingCapital;
  const returnRate = startingCapital > 0 ? pnl / startingCapital : 0;
  const annualizedReturn = returnRate / days * 365;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO pnl_records (
      id, period, start_date, end_date, starting_capital, ending_capital, pnl, return_rate, days, annualized_return,
      status, auto_accumulate, editable
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'settled', 0, 0)
  `).run(id, period, startDate, endDate, startingCapital, endingCapital, pnl, returnRate, days, annualizedReturn);

  res.json(formatPnlRecord(
    db.prepare('SELECT * FROM pnl_records WHERE id = ?').get(id) as any
  ));
});

// GET /api/pnl/revenue
router.get('/revenue', (_req, res) => {
  const overview = db.prepare('SELECT * FROM revenue_overview LIMIT 1').get();
  if (!overview) {
    return res.json(null);
  }
  res.json(formatRevenue(overview as any));
});

// PUT /api/pnl/revenue
router.put('/revenue', (req, res) => {
  const { periodLabel, startDate, initialInvestment, fairValue, cashValue, profit, returnRate, runningDays, annualizedReturn } = req.body;

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
  `).run(id, periodLabel, startDate, initialInvestment, fairValue, cashValue, profit, returnRate, runningDays, annualizedReturn);

  res.json(formatRevenue(
    db.prepare('SELECT * FROM revenue_overview WHERE id = ?').get(id) as any
  ));
});

// POST /api/pnl/monthly - 手动创建月度记录
router.post('/monthly', async (req, res) => {
  const { month, startingCapital, pnl, days, auto = false, endDate } = req.body;
  if (!month) {
    return res.status(400).json({ error: 'Missing required fields: month' });
  }

  const startDate = `${month}-01`;
  const defaultDays = diffDaysUtc(startDate, getTodayUtcDate());
  const finalDays = days ? Number(days) : defaultDays;
  const finalPnl = pnl != null ? Number(pnl) : 0;
  const resolvedEndDate =
    endDate ||
    new Date(new Date(`${startDate}T00:00:00Z`).getTime() + finalDays * 86400000)
      .toISOString()
      .slice(0, 10);

  const latestLockedMonthly: any = db.prepare(
    "SELECT * FROM pnl_records WHERE period = 'monthly' AND status = 'locked' ORDER BY start_date DESC LIMIT 1"
  ).get();
  const revenue: any = db.prepare('SELECT * FROM revenue_overview LIMIT 1').get();

  const resolvedStartingCapital =
    startingCapital != null
      ? Number(startingCapital)
      : (latestLockedMonthly ? Number(latestLockedMonthly.ending_capital) : (revenue ? Number(revenue.initial_investment) : null));

  if (resolvedStartingCapital == null || !Number.isFinite(resolvedStartingCapital)) {
    return res.status(400).json({ error: 'Missing startingCapital and no baseline to infer from' });
  }

  const metrics = recalcByPnl(resolvedStartingCapital, finalPnl, finalDays);
  const id = uuidv4();

  if (auto) {
    const currentMonthly: any = db.prepare(
      "SELECT * FROM pnl_records WHERE period = 'monthly' AND status = 'in_progress' ORDER BY start_date DESC LIMIT 1"
    ).get();
    if (currentMonthly) {
      db.prepare(`
        UPDATE pnl_records
        SET status = 'locked', auto_accumulate = 0, editable = 0
        WHERE id = ?
      `).run(currentMonthly.id);
    }
  }

  const income = await fetchIncomeBreakdownSafe();
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
    auto ? 'in_progress' : 'locked',
    auto ? 1 : 0,
    auto ? 1 : 0,
    income.uniswap,
    income.morpho,
    income.hlp,
    getTodayUtcDate()
  );
  res.json(formatPnlRecord(db.prepare('SELECT * FROM pnl_records WHERE id = ?').get(id) as any));
});

// DELETE /api/pnl/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM pnl_records WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// PUT /api/pnl/:id - 手动修正 (must be after /revenue to avoid matching "revenue" as :id)
router.put('/:id', (req, res) => {
  const { startingCapital, endingCapital, pnl, returnRate, annualizedReturn, days, endDate } = req.body;
  const existing: any = db.prepare('SELECT * FROM pnl_records WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Record not found' });
  }

  const nextStartingCapital = startingCapital ?? existing.starting_capital;
  const nextPnl = pnl ?? existing.pnl;
  const nextDays = days ?? existing.days;
  const computed = recalcByPnl(nextStartingCapital, nextPnl, nextDays);
  const nextEndingCapital = endingCapital ?? computed.endingCapital;
  const nextReturnRate = returnRate ?? computed.returnRate;
  const nextAnnualizedReturn = annualizedReturn ?? computed.annualizedReturn;

  const nextStatus =
    existing.period === 'monthly'
      ? 'locked'
      : (existing.status === 'in_progress' ? 'in_progress' : 'settled');
  const nextAutoAccumulate = existing.period === 'monthly' ? 0 : (existing.status === 'in_progress' ? 1 : 0);
  const nextEditable = existing.period === 'monthly' ? 0 : (existing.status === 'in_progress' ? 1 : 0);

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
      is_adjusted = 1
    WHERE id = ?
  `).run(
    req.body.startDate ?? null,
    endDate ?? null,
    nextStartingCapital,
    nextEndingCapital,
    nextPnl,
    nextReturnRate,
    nextDays,
    nextAnnualizedReturn,
    nextStatus,
    nextAutoAccumulate,
    nextEditable,
    req.params.id
  );

  const updated: any = db.prepare('SELECT * FROM pnl_records WHERE id = ?').get(req.params.id);
  if (existing.period === 'weekly' && (req.body.endDate || updated?.end_date)) {
    syncMonthlyInProgressEndDate(req.body.endDate || updated.end_date);
  }
  res.json(formatPnlRecord(updated));
});

function formatPnlRecord(r: any) {
  return {
    id: r.id,
    period: r.period,
    startDate: r.start_date,
    endDate: r.end_date,
    startingCapital: r.starting_capital,
    endingCapital: r.ending_capital,
    pnl: r.pnl,
    returnRate: r.return_rate,
    days: r.days,
    annualizedReturn: r.annualized_return,
    isAdjusted: !!r.is_adjusted,
    status: r.status || 'settled',
    autoAccumulate: !!r.auto_accumulate,
    editable: !!r.editable,
    incomeUniswap: r.income_uniswap || 0,
    incomeMorpho: r.income_morpho || 0,
    incomeHlp: r.income_hlp || 0,
    incomeTotal: r.income_total || 0,
    lastAutoUpdateAt: r.last_auto_update_at || null,
  };
}

function formatRevenue(r: any) {
  return {
    id: r.id,
    periodLabel: r.period_label,
    startDate: r.start_date,
    initialInvestment: r.initial_investment,
    fairValue: r.fair_value,
    cashValue: r.cash_value,
    profit: r.profit,
    returnRate: r.return_rate,
    runningDays: r.running_days,
    annualizedReturn: r.annualized_return,
  };
}

async function fetchIncomeBreakdownSafe() {
  try {
    const data = await fetchPositionsAggregate();
    return data.incomeBreakdown;
  } catch (error: any) {
    console.error('[PnL] Failed to fetch income breakdown:', error.message);
    return { uniswap: 0, morpho: 0, hlp: 0, total: 0 };
  }
}

export async function runDailyPnlAutoAccumulate(today = getTodayUtcDate()) {
  const records: any[] = db.prepare(`
    SELECT * FROM pnl_records
    WHERE status = 'in_progress' AND auto_accumulate = 1
  `).all();
  if (records.length === 0) return { updated: 0 };

  const income = await fetchIncomeBreakdownSafe();
  let updated = 0;

  for (const record of records) {
    if (record.last_auto_update_at === today) continue;
    const dayDeltaUniswap = Math.max(0, income.uniswap - (record.last_uniswap_value || 0));
    const dayDeltaMorpho = Math.max(0, income.morpho - (record.last_morpho_value || 0));
    const dayDeltaHlp = Math.max(0, income.hlp - (record.last_hlp_value || 0));
    const dayDeltaTotal = dayDeltaUniswap + dayDeltaMorpho + dayDeltaHlp;

    const nextPnl = (record.pnl || 0) + dayDeltaTotal;
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
        income_uniswap = COALESCE(income_uniswap, 0) + ?,
        income_morpho = COALESCE(income_morpho, 0) + ?,
        income_hlp = COALESCE(income_hlp, 0) + ?,
        income_total = COALESCE(income_total, 0) + ?,
        last_uniswap_value = ?,
        last_morpho_value = ?,
        last_hlp_value = ?,
        last_auto_update_at = ?
      WHERE id = ?
    `).run(
      today,
      nextPnl,
      metrics.endingCapital,
      metrics.returnRate,
      days,
      metrics.annualizedReturn,
      dayDeltaUniswap,
      dayDeltaMorpho,
      dayDeltaHlp,
      dayDeltaTotal,
      income.uniswap,
      income.morpho,
      income.hlp,
      today,
      record.id
    );
    updated += 1;
  }
  return { updated };
}

export default router;
