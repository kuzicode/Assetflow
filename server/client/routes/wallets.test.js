import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDataDir } from '../test/setup.js';
import { setWalletsDataDir } from '../repositories/walletsRepo.js';
const { dir, cleanup } = createTestDataDir();
setWalletsDataDir(dir);
const { deleteWallet, insertWallet, listWalletRows, updateWalletLabel } = await import('../repositories/walletsRepo.js');
const { createAdminSession, clearAdminSession } = await import('../auth/session.js');
const { requireAdmin } = await import('../middleware/requireAdmin.js');
afterAll(() => cleanup());
function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}
describe('wallet repository', () => {
    it('creates, updates, lists, and deletes wallets', () => {
        insertWallet('wallet-1', 'Main', '0x1234', ['ethereum']);
        expect(listWalletRows()).toHaveLength(1);
        updateWalletLabel('wallet-1', 'Primary');
        expect(listWalletRows()[0].label).toBe('Primary');
        deleteWallet('wallet-1');
        expect(listWalletRows()).toEqual([]);
    });
});
describe('requireAdmin middleware', () => {
    beforeEach(() => {
        clearAdminSession();
    });
    it('rejects requests without a valid token', () => {
        const req = { headers: {} };
        const res = createMockRes();
        const next = vi.fn();
        requireAdmin(req, res, next);
        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });
    it('allows requests with a valid bearer token', () => {
        const session = createAdminSession();
        const req = { headers: { authorization: `Bearer ${session.token}` } };
        const res = createMockRes();
        const next = vi.fn();
        requireAdmin(req, res, next);
        expect(res.statusCode).toBe(200);
        expect(next).toHaveBeenCalledTimes(1);
    });
});
