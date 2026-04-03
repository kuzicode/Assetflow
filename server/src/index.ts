import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env from project root regardless of CWD (make dev-server runs from server/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Override global fetch with undici's fetch so proxy env vars are respected.
// Node.js built-in fetch uses its own internal undici bundle and ignores setGlobalDispatcher
// from the npm undici package. Replacing globalThis.fetch with undici's fetch fixes this.
const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
{
  const { ProxyAgent, setGlobalDispatcher, fetch: undiciFetch } = await import('undici');
  if (proxyUrl) {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    console.log(`[Proxy] Global dispatcher set to ${proxyUrl}`);
  }
  // Always use undici's fetch so the dispatcher is respected
  (globalThis as any).fetch = undiciFetch;
}

import './db/index.js';
import app from './app.js';
import cron from 'node-cron';
import { runDailyPnlAutoAccumulate } from './routes/pnl.js';
import { runAutoSnapshot } from './routes/snapshots.js';
import { prefetchYields } from './routes/yields.js';
import { getPositionsSnapshot } from './services/positionsService.js';
import { getMvrv, getAhr999, getBtcdom } from './services/indicatorService.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Assetflow server running on port ${PORT}`);
});

// PnL auto-accumulate: UTC 00:00 daily
cron.schedule('0 0 * * *', async () => {
  try {
    const result = await runDailyPnlAutoAccumulate();
    console.log(`[PnLCron] UTC daily update completed, updated=${result.updated}`);
  } catch (error: any) {
    console.error('[PnLCron] UTC daily update failed:', error.message);
  }
}, { timezone: 'UTC' });

// Daily jobs: UTC+8 08:00 — snapshot + yields prefetch
cron.schedule('0 8 * * *', async () => {
  try {
    const result = await runAutoSnapshot();
    if (result.skipped) {
      console.log(`[Snapshot] ${result.date} already exists, skipped`);
    } else {
      console.log(`[Snapshot] ${result.date} saved, totalUsd=${Math.round(result.totalUsd!)}`);
    }
  } catch (error: any) {
    console.error('[Snapshot] auto-snapshot failed:', error.message);
  }
  try {
    await prefetchYields();
    console.log('[Yields] daily prefetch completed');
  } catch (error: any) {
    console.error('[Yields] daily prefetch failed:', error.message);
  }
  for (const [name, fn] of [['MVRV', getMvrv], ['AHR999', getAhr999], ['BTCDOM', getBtcdom]] as const) {
    try {
      await fn();
      console.log(`[Indicators] ${name} daily prefetch completed`);
    } catch (error: any) {
      console.error(`[Indicators] ${name} daily prefetch failed:`, error.message);
    }
  }
}, { timezone: 'Asia/Shanghai' });

// Startup catch-up
runDailyPnlAutoAccumulate().catch((error: any) => {
  console.error('[PnLCron] startup update failed:', error.message);
});
runAutoSnapshot().catch((error: any) => {
  console.error('[Snapshot] startup snapshot failed:', error.message);
});
prefetchYields().catch((error: any) => {
  console.error('[Yields] startup prefetch failed:', error.message);
});
// Positions: warm cache on startup so first user visit is instant.
// Delayed 30s to avoid OKX rate-limit collision with PnL cron + snapshot catch-up.
setTimeout(() => {
  getPositionsSnapshot().catch((error: any) => {
    console.error('[Positions] startup prefetch failed:', error.message);
  });
}, 30_000);
getMvrv().catch((error: any) => { console.error('[Indicators] MVRV startup prefetch failed:', error.message); });
getAhr999().catch((error: any) => { console.error('[Indicators] AHR999 startup prefetch failed:', error.message); });
getBtcdom().catch((error: any) => { console.error('[Indicators] BTCDOM startup prefetch failed:', error.message); });
