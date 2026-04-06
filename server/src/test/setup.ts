import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create a temporary directory with empty JSON files for all repos.
 * Provides test isolation for any combination of JSON-based repositories.
 */
export function createTestDataDir(): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assetflow-test-'));
  fs.writeFileSync(path.join(dir, 'weekly_pnl.json'), '{"records":[]}', 'utf-8');
  fs.writeFileSync(path.join(dir, 'monthly_pnl.json'), '{"records":[]}', 'utf-8');
  fs.writeFileSync(path.join(dir, 'wallets.json'), '{"records":[]}', 'utf-8');
  fs.writeFileSync(path.join(dir, 'manual_assets.json'), '{"records":[]}', 'utf-8');
  fs.writeFileSync(path.join(dir, 'settings.json'), '{}', 'utf-8');
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  return { dir, cleanup };
}

/**
 * @deprecated Use createTestDataDir instead.
 */
export function createTestPnlDir(): { dir: string; cleanup: () => void } {
  return createTestDataDir();
}
