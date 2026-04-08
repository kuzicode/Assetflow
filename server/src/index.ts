import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env from project root regardless of CWD (make dev-server runs from server/)
// IMPORTANT: dotenv.config() must run before any other module imports so that
// process.env vars (e.g. ETH_RPC_URL) are set when chains.ts initialises EVM_RPCS.
// Static imports are hoisted before module body in ESM, so we use dynamic import()
// for everything that transitively reads process.env at module-load time.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// When a local proxy is configured (e.g. dev machine behind Clash/V2Ray),
// Node.js built-in fetch ignores http_proxy env vars. Fix: replace globalThis.fetch
// with undici's fetch + ProxyAgent so the proxy is respected.
// Only activated when a proxy URL is present — production servers skip this entirely.
const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
if (proxyUrl) {
  const { ProxyAgent, setGlobalDispatcher, fetch: undiciFetch } = await import('undici');
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  (globalThis as any).fetch = undiciFetch;
  console.log(`[Proxy] Global dispatcher set to ${proxyUrl}`);
}

// Dynamic imports — must come AFTER dotenv.config() so env vars are visible
const { default: app } = await import('./app.js');
const { default: cron } = await import('node-cron');
const { runDailyPnlAutoAccumulate } = await import('./routes/pnl.js');
const { prefetchYields } = await import('./routes/yields.js');
const { getPositionsSnapshot } = await import('./services/positionsService.js');
const { getMvrv, getAhr999, getBtcdom } = await import('./services/indicatorService.js');

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

// Daily jobs: UTC+8 08:00 — yields prefetch
cron.schedule('0 8 * * *', async () => {
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
