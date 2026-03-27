import 'dotenv/config';
import './db/index.js';
import app from './app.js';
import cron from 'node-cron';
import { runDailyPnlAutoAccumulate } from './routes/pnl.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Assetflow server running on port ${PORT}`);
});

cron.schedule('0 0 * * *', async () => {
  try {
    const result = await runDailyPnlAutoAccumulate();
    console.log(`[PnLCron] UTC daily update completed, updated=${result.updated}`);
  } catch (error: any) {
    console.error('[PnLCron] UTC daily update failed:', error.message);
  }
}, { timezone: 'UTC' });

// Startup catch-up (idempotent by date)
runDailyPnlAutoAccumulate().catch((error: any) => {
  console.error('[PnLCron] startup update failed:', error.message);
});
