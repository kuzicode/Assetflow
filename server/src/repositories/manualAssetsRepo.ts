import db from '../db/index.js';

export function listManualAssetRows() {
  return db.prepare('SELECT * FROM manual_assets ORDER BY base_token, label').all() as any[];
}

export function upsertManualAsset(input: {
  id: string;
  label: string;
  baseToken: string;
  amount: number;
  source: string;
  platform: string;
  updatedAt: string;
}) {
  db.prepare(`
    INSERT INTO manual_assets (id, label, base_token, amount, source, platform, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      base_token = excluded.base_token,
      amount = excluded.amount,
      source = excluded.source,
      platform = excluded.platform,
      updated_at = excluded.updated_at
  `).run(input.id, input.label, input.baseToken, input.amount, input.source, input.platform, input.updatedAt);
}

export function deleteManualAsset(id: string) {
  return db.prepare('DELETE FROM manual_assets WHERE id = ?').run(id);
}
