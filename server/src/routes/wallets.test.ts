import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createTestDb } from '../test/setup.js';
import request from 'supertest';

const testDb = createTestDb();
vi.mock('../db/index.js', () => ({ default: testDb }));

// Import app after mock is set up
const { default: express } = await import('express');
const { default: walletsRouter } = await import('./wallets.js');

const app = express();
app.use(express.json());
app.use('/api/wallets', walletsRouter);

describe('Wallets API', () => {
  let walletId: string;

  it('GET /api/wallets returns empty array initially', async () => {
    const res = await request(app).get('/api/wallets');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/wallets creates a wallet', async () => {
    const res = await request(app)
      .post('/api/wallets')
      .send({ label: 'Test Wallet', address: '0x1234abcd', chains: ['ethereum', 'arbitrum'] });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Test Wallet');
    expect(res.body.address).toBe('0x1234abcd');
    expect(res.body.chains).toEqual(['ethereum', 'arbitrum']);
    expect(res.body.id).toBeDefined();
    walletId = res.body.id;
  });

  it('GET /api/wallets returns created wallet', async () => {
    const res = await request(app).get('/api/wallets');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].label).toBe('Test Wallet');
    expect(res.body[0].chains).toEqual(['ethereum', 'arbitrum']);
  });

  it('POST /api/wallets rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/wallets')
      .send({ label: 'No Address' });
    expect(res.status).toBe(400);
  });

  it('DELETE /api/wallets/:id deletes wallet', async () => {
    const res = await request(app).delete(`/api/wallets/${walletId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /api/wallets/:id returns 404 for non-existent', async () => {
    const res = await request(app).delete('/api/wallets/non-existent');
    expect(res.status).toBe(404);
  });

  it('GET /api/wallets returns empty after deletion', async () => {
    const res = await request(app).get('/api/wallets');
    expect(res.body).toEqual([]);
  });
});
