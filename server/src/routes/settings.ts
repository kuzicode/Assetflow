import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { getSettingsMap, upsertSettings } from '../repositories/settingsRepo.js';

const router = Router();

// GET /api/settings
router.get('/', (_req, res) => {
  res.json(getSettingsMap());
});

// PUT /api/settings
router.put('/', requireAdmin, (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'Invalid settings payload' });
  }
  upsertSettings(
    Object.fromEntries(
      Object.entries(updates).map(([key, value]) => [key, String(value)])
    )
  );
  res.json({ success: true });
});

export default router;
