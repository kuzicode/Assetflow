import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';

const router = Router();

// GET /api/wallets
router.get('/', (_req, res) => {
  const wallets = db.prepare('SELECT * FROM wallets').all();
  res.json(wallets.map((w: any) => ({
    ...w,
    chains: JSON.parse(w.chains_json),
  })));
});

// POST /api/wallets
router.post('/', (req, res) => {
  const { label, address, chains } = req.body;
  if (!label || !address || !chains?.length) {
    return res.status(400).json({ error: 'Missing label, address, or chains' });
  }
  const id = uuidv4();
  db.prepare('INSERT INTO wallets (id, label, address, chains_json) VALUES (?, ?, ?, ?)')
    .run(id, label, address, JSON.stringify(chains));
  res.json({ id, label, address, chains });
});

// PATCH /api/wallets/:id
router.patch('/:id', (req, res) => {
  const { label } = req.body;
  if (!label) return res.status(400).json({ error: 'Missing label' });
  const result = db.prepare('UPDATE wallets SET label = ? WHERE id = ?').run(label, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Wallet not found' });
  res.json({ success: true });
});

// DELETE /api/wallets/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM wallets WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Wallet not found' });
  }
  res.json({ success: true });
});

export default router;
