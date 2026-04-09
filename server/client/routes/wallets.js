import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { deleteWallet, insertWallet, listWalletRows, updateWalletLabel } from '../repositories/walletsRepo.js';
import { invalidatePositionsSnapshotCache } from '../services/positionsService.js';
const router = Router();
// GET /api/wallets
router.get('/', (_req, res) => {
    res.json(listWalletRows());
});
// POST /api/wallets
router.post('/', requireAdmin, (req, res) => {
    const { label, address, chains } = req.body;
    if (typeof label !== 'string' || !label.trim() || typeof address !== 'string' || !address.trim() || !Array.isArray(chains) || chains.length === 0) {
        return res.status(400).json({ error: 'Missing label, address, or chains' });
    }
    const id = uuidv4();
    insertWallet(id, label.trim(), address.trim(), chains);
    invalidatePositionsSnapshotCache();
    res.json({ id, label: label.trim(), address: address.trim(), chains });
});
// PATCH /api/wallets/:id
router.patch('/:id', requireAdmin, (req, res) => {
    const { label } = req.body;
    if (typeof label !== 'string' || !label.trim())
        return res.status(400).json({ error: 'Missing label' });
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updated = updateWalletLabel(id, label.trim());
    if (!updated)
        return res.status(404).json({ error: 'Wallet not found' });
    invalidatePositionsSnapshotCache();
    res.json({ success: true });
});
// DELETE /api/wallets/:id
router.delete('/:id', requireAdmin, (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const deleted = deleteWallet(id);
    if (!deleted)
        return res.status(404).json({ error: 'Wallet not found' });
    invalidatePositionsSnapshotCache();
    res.json({ success: true });
});
export default router;
