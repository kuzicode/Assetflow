import { describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../test/setup.js';

const testDb = createTestDb();
vi.mock('../db/index.js', () => ({ default: testDb }));

const { getSettingsMap, upsertSettings } = await import('../repositories/settingsRepo.js');

describe('settings repository', () => {
  it('reads default settings from schema', () => {
    const settings = getSettingsMap();
    expect(settings.settlement_day).toBe('4');
    expect(settings.auto_snapshot).toBe('true');
    expect(settings.base_currency).toBe('USDT');
  });

  it('updates and inserts settings values', () => {
    upsertSettings({ settlement_day: '1', auto_snapshot: 'false', custom_key: 'custom_value' });
    const settings = getSettingsMap();
    expect(settings.settlement_day).toBe('1');
    expect(settings.auto_snapshot).toBe('false');
    expect(settings.custom_key).toBe('custom_value');
    expect(settings.base_currency).toBe('USDT');
  });
});
