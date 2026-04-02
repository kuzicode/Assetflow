import { fetchAaveUsdcSupplyApy } from '../defi/aaveV3.js';
import { fetchMorphoVaultApy } from '../defi/morphoVault.js';
import { fetchHlpApy } from '../defi/hyperliquidHlp.js';

const CACHE_TTL = 24 * 60 * 60 * 1000;

interface YieldsSnapshot {
  aave_usdc: { apy: number | null; chain: string };
  morpho_usdc: { apy: number | null; chain: string; vault: string };
  hlp: { apy: number | null };
  updatedAt: string;
  partialFailureSources: string[];
  isStale: boolean;
}

let cache: YieldsSnapshot | null = null;
let cacheTime = 0;

async function fetchYieldsSnapshot(): Promise<YieldsSnapshot> {
  const [aaveResult, morphoResult, hlpResult] = await Promise.allSettled([
    fetchAaveUsdcSupplyApy(),
    fetchMorphoVaultApy(),
    fetchHlpApy(),
  ]);

  const partialFailureSources = [
    aaveResult.status === 'rejected' ? 'aave' : null,
    morphoResult.status === 'rejected' ? 'morpho' : null,
    hlpResult.status === 'rejected' ? 'hlp' : null,
  ].filter(Boolean) as string[];

  const result: YieldsSnapshot = {
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
    partialFailureSources,
    isStale: partialFailureSources.length > 0,
  };

  cache = result;
  cacheTime = Date.now();
  return result;
}

export async function getYieldsSnapshot(force = false) {
  const now = Date.now();
  if (!force && cache && now - cacheTime < CACHE_TTL) return cache;
  return fetchYieldsSnapshot();
}

export async function prefetchYields() {
  return fetchYieldsSnapshot();
}
