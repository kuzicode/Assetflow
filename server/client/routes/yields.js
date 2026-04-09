import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { getYieldsSnapshot, prefetchYields } from '../services/yieldsService.js';
const router = Router();
router.get('/', async (req, res) => {
    try {
        const force = req.query.force === '1';
        const result = await getYieldsSnapshot(force);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/refresh', requireAdmin, async (_req, res) => {
    try {
        const result = await getYieldsSnapshot(true);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export { prefetchYields };
export default router;
