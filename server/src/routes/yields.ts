import { Router } from 'express';
import { fetchAaveUsdcSupplyApy } from '../defi/aaveV3.js';
import { fetchMorphoVaultApy } from '../defi/morphoVault.js';
import { fetchHlpApy } from '../defi/hyperliquidHlp.js';

const router = Router();

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

let cache: any = null;
let cacheTime = 0;

async function doFetch() {
  const [aaveResult, morphoResult, hlpResult] = await Promise.allSettled([
    fetchAaveUsdcSupplyApy(),
    fetchMorphoVaultApy(),
    fetchHlpApy(),
  ]);

  const result = {
    aave_usdc: {
      apy: aaveResult.status === 'fulfilled' ? aaveResult.value : null,
      chain: 'ethereum',
    },
    morpho_usdc: {
      apy: morphoResult.status === 'fulfilled' ? morphoResult.value : null,
      chain: 'base',
      vault: 'Steakhouse USDC',
    },
    hlp: {
      apy: hlpResult.status === 'fulfilled' ? hlpResult.value : null,
    },
    updatedAt: new Date().toISOString(),
  };

  cache = result;
  cacheTime = Date.now();
  return result;
}

/** Called by scheduler (UTC+8 08:00) and on startup. */
export async function prefetchYields() {
  return doFetch();
}

// GET /api/yields?force=1  — bypass cache
router.get('/', async (req, res) => {
  const force = req.query.force === '1';
  const now = Date.now();

  if (!force && cache && now - cacheTime < CACHE_TTL) {
    return res.json(cache);
  }

  const result = await doFetch();
  res.json(result);
});

export default router;
