import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { createMonthlyPnlRecord, createWeeklyPnlRecord, deletePnlRecordById, getMonthlyPnlRecords, getRevenueOverview, getWeeklyPnlRecords, runDailyPnlAutoAccumulate, updatePnlRecordById, updateRevenueOverview } from '../services/pnlService.js';

const router = Router();

router.get('/weekly', (req, res) => {
  res.json(
    getWeeklyPnlRecords({
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
    })
  );
});

router.get('/monthly', (req, res) => {
  res.json(
    getMonthlyPnlRecords({
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
    })
  );
});

router.post('/weekly', requireAdmin, async (req, res) => {
  if (typeof req.body?.startDate !== 'string' || !req.body.startDate) {
    return res.status(400).json({ error: 'Missing required fields: startDate' });
  }
  try {
    const record = await createWeeklyPnlRecord(req.body);
    res.json(record);
  } catch (error: any) {
    const status = /Missing|must equal/.test(error.message) ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

router.post('/monthly', requireAdmin, async (req, res) => {
  if (typeof req.body?.month !== 'string' || !req.body.month) {
    return res.status(400).json({ error: 'Missing required fields: month' });
  }
  try {
    const record = await createMonthlyPnlRecord(req.body);
    res.json(record);
  } catch (error: any) {
    const status = /Missing/.test(error.message) ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});


router.get('/revenue', (_req, res) => {
  res.json(getRevenueOverview());
});

router.put('/revenue', requireAdmin, (req, res) => {
  const body = req.body || {};
  if (typeof body.periodLabel !== 'string' || typeof body.startDate !== 'string' || typeof body.endDate !== 'string') {
    return res.status(400).json({ error: 'Invalid revenue payload' });
  }
  res.json(updateRevenueOverview(body));
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const deleted = deletePnlRecordById(id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

router.put('/:id', requireAdmin, (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const updated = updatePnlRecordById(id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Record not found' });
  res.json(updated);
});

export { runDailyPnlAutoAccumulate };
export default router;
