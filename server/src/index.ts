import 'dotenv/config';
import './db/index.js';
import app from './app.js';
import cron from 'node-cron';
import { runDailyPnlAutoAccumulate } from './routes/pnl.js';
import { runAutoSnapshot } from './routes/snapshots.js';

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

// Daily auto-snapshot: UTC+8 08:00 (= UTC 00:00)
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
}, { timezone: 'Asia/Shanghai' });

// Startup catch-up
runDailyPnlAutoAccumulate().catch((error: any) => {
  console.error('[PnLCron] startup update failed:', error.message);
});
runAutoSnapshot().catch((error: any) => {
  console.error('[Snapshot] startup snapshot failed:', error.message);
});
