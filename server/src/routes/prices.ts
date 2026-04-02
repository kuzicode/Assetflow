import { Router } from 'express';
import { fetchPrices } from '../utils/price.js';

const router = Router();

// GET /api/prices?symbols=ETH,BTC,BNB
router.get('/', async (req, res) => {
  try {
    const symbols = (req.query.symbols as string)?.split(',').filter(Boolean) || [];
    if (symbols.length === 0) {
      return res.status(400).json({ error: 'Missing symbols parameter' });
    }

    const snapshot = await fetchPrices(symbols);
    res.json(snapshot);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
