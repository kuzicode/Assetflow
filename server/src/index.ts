import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env from project root regardless of CWD (make dev-server runs from server/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import './db/index.js';
import app from './app.js';
import cron from 'node-cron';
import { runDailyPnlAutoAccumulate } from './routes/pnl.js';
import { runAutoSnapshot } from './routes/snapshots.js';
import { prefetchYields } from './routes/yields.js';

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
