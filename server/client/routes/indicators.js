import { Router } from 'express';
import { getMaChart, getMaTrends, getMvrv, getAhr999, getBtcdom } from '../services/indicatorService.js';
const router = Router();
router.post('/ma/chart', async (req, res) => {
    try {
        const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol : 'BTC';
        const interval = typeof req.body?.interval === 'string' ? req.body.interval : '4h';
        const result = await getMaChart(symbol, interval);
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load MA chart';
        res.status(500).json({ error: message });
    }
});
router.post('/ma/trends', async (req, res) => {
    try {
        const interval = typeof req.body?.interval === 'string' ? req.body.interval : '4h';
        const symbols = Array.isArray(req.body?.symbols)
            ? req.body.symbols.filter((item) => typeof item === 'string')
            : undefined;
        const result = await getMaTrends(interval, symbols);
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load MA trends';
        res.status(500).json({ error: message });
    }
});
router.get('/mvrv', async (_req, res) => {
    try {
        const result = await getMvrv();
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load MVRV data';
        res.status(500).json({ error: message });
    }
});
router.get('/ahr999', async (_req, res) => {
    try {
        const result = await getAhr999();
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load AHR999 data';
        res.status(500).json({ error: message });
    }
});
router.get('/btcdom', async (_req, res) => {
    try {
        const result = await getBtcdom();
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load BTCDOM data';
        res.status(500).json({ error: message });
    }
});
export default router;
