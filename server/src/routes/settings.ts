import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// GET /api/settings
router.get('/', (_req, res) => {
  const rows: any[] = db.prepare('SELECT * FROM settings').all();
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  res.json(settings);
});

// PUT /api/settings
router.put('/', (req, res) => {
  const updates = req.body;
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  const transaction = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) {
      upsert.run(key, String(value));
    }
  });

  transaction(Object.entries(updates));
  res.json({ success: true });
});

export default router;
