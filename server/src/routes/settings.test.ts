import { describe, it, expect, vi } from 'vitest';
import { createTestDb } from '../test/setup.js';
import request from 'supertest';

const testDb = createTestDb();
vi.mock('../db/index.js', () => ({ default: testDb }));

const { default: express } = await import('express');
const { default: settingsRouter } = await import('./settings.js');

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRouter);

describe('Settings API', () => {
  it('GET /api/settings returns default settings from schema', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settlement_day).toBe('4');
    expect(res.body.auto_snapshot).toBe('true');
    expect(res.body.base_currency).toBe('USDT');
  });

  it('PUT /api/settings updates settings', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ settlement_day: '1', auto_snapshot: 'false' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/settings reflects updates', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.body.settlement_day).toBe('1');
    expect(res.body.auto_snapshot).toBe('false');
    // base_currency unchanged
    expect(res.body.base_currency).toBe('USDT');
  });

  it('PUT /api/settings can add new keys', async () => {
    await request(app)
      .put('/api/settings')
      .send({ custom_key: 'custom_value' });

    const res = await request(app).get('/api/settings');
    expect(res.body.custom_key).toBe('custom_value');
  });
});
