import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { findAutoSnapshotByDatePrefix, insertSnapshot, listSnapshots } from '../repositories/snapshotsRepo.js';
import { getSettingsMap } from '../repositories/settingsRepo.js';
import { getPositionsSnapshot } from '../services/positionsService.js';

const router = Router();

export async function runAutoSnapshot() {
  const settings = getSettingsMap();
  if (settings.auto_snapshot === 'false') {
    return { skipped: true, reason: 'disabled' as const };
  }

  const now = new Date(Date.now() + 8 * 3600_000);
  const dateStr = now.toISOString().slice(0, 10);
  const existing = findAutoSnapshotByDatePrefix(dateStr);
  if (existing) return { skipped: true, date: dateStr };

  const data = await getPositionsSnapshot();
  const totalUsd = data.positions.reduce((sum, position) => sum + position.totalUsdValue, 0);
  insertSnapshot({
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    type: 'auto',
    totalFairValue: totalUsd,
    totalCashValue: totalUsd,
    positionsJson: JSON.stringify(data.positions),
    pricesJson: JSON.stringify(data.prices),
  });

  return { skipped: false, date: dateStr, totalUsd };
}

router.post('/', requireAdmin, (req, res) => {
  const { type, totalFairValue, totalCashValue, positions, prices } = req.body;
  insertSnapshot({
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    type: type === 'auto' ? 'auto' : 'manual',
    totalFairValue: Number(totalFairValue) || 0,
    totalCashValue: Number(totalCashValue) || 0,
    positionsJson: JSON.stringify(Array.isArray(positions) ? positions : []),
    pricesJson: JSON.stringify(prices && typeof prices === 'object' ? prices : {}),
  });
  res.json({ success: true });
});

router.get('/', (req, res) => {
  const snapshots = listSnapshots({
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  res.json(snapshots.map((snapshot) => ({
    ...snapshot,
    positions: JSON.parse(snapshot.positions_json),
    prices: JSON.parse(snapshot.prices_json),
    totalFairValue: snapshot.total_fair_value,
    totalCashValue: snapshot.total_cash_value,
  })));
});

export default router;
