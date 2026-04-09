import { afterAll, describe, expect, it } from 'vitest';
import { createTestDataDir } from '../test/setup.js';
import { setSettingsDataDir } from '../repositories/settingsRepo.js';
const { dir, cleanup } = createTestDataDir();
setSettingsDataDir(dir);
const { getSettingsMap, upsertSettings } = await import('../repositories/settingsRepo.js');
afterAll(() => cleanup());
describe('settings repository', () => {
    it('reads default settings when file is empty', () => {
        const settings = getSettingsMap();
        expect(settings.settlement_day).toBe('4');
        expect(settings.auto_snapshot).toBe('false');
        expect(settings.base_currency).toBe('USDT');
    });
    it('updates and inserts settings values', () => {
        upsertSettings({ settlement_day: '1', auto_snapshot: 'true', custom_key: 'custom_value' });
        const settings = getSettingsMap();
        expect(settings.settlement_day).toBe('1');
        expect(settings.auto_snapshot).toBe('true');
        expect(settings.custom_key).toBe('custom_value');
        expect(settings.base_currency).toBe('USDT');
    });
});
