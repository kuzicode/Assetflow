import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { deleteManualAsset, listManualAssetRows, upsertManualAsset } from '../repositories/manualAssetsRepo.js';
import { getCachedPositionsSnapshot, getPositionsSnapshot, invalidatePositionsSnapshotCache } from '../services/positionsService.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const data = await getPositionsSnapshot();
    res.json(data);
  } catch (error: any) {
    console.error('[Positions] Fetch error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/refresh', requireAdmin, async (_req, res) => {
  try {
    invalidatePositionsSnapshotCache();
    const data = await getPositionsSnapshot({ force: true });
    res.json(data);
  } catch (error: any) {
    console.error('[Positions] Refresh error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/fetch', async (_req, res) => {
  try {
    const cached = getCachedPositionsSnapshot();
    if (cached) return res.json(cached);
    const data = await getPositionsSnapshot();
    res.json(data);
  } catch (error: any) {
    console.error('[Positions] Fetch error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/manual', (_req, res) => {
  const assets = listManualAssetRows();
  res.json(assets.map((asset) => ({
    id: asset.id,
    label: asset.label,
    baseToken: asset.baseToken,
    amount: asset.amount,
    source: asset.source,
    platform: asset.platform || '',
    updatedAt: asset.updatedAt,
  })));
});

router.post('/manual', requireAdmin, (req, res) => {
  const { id, label, baseToken, amount, source, platform } = req.body;
  if (typeof label !== 'string' || !label.trim()) {
    return res.status(400).json({ error: 'label is required' });
  }
  if (typeof baseToken !== 'string' || !baseToken.trim()) {
    return res.status(400).json({ error: 'baseToken is required' });
  }
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount)) {
    return res.status(400).json({ error: 'amount must be a valid number' });
  }

  const assetId = typeof id === 'string' && id ? id : uuidv4();
  const updatedAt = new Date().toISOString();
  upsertManualAsset({
    id: assetId,
    label: label.trim(),
    baseToken: baseToken.trim(),
    amount: parsedAmount,
    source: typeof source === 'string' && source ? source : 'cex_manual',
    platform: typeof platform === 'string' ? platform : '',
    updatedAt,
  });
  invalidatePositionsSnapshotCache();

  res.json({
    id: assetId,
    label: label.trim(),
    baseToken: baseToken.trim(),
    amount: parsedAmount,
    source: typeof source === 'string' && source ? source : 'cex_manual',
    platform: typeof platform === 'string' ? platform : '',
    updatedAt,
  });
});

router.delete('/manual/:id', requireAdmin, (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const deleted = deleteManualAsset(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  invalidatePositionsSnapshotCache();
  res.json({ success: true });
});

export default router;
