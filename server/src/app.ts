import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRouter from './routes/auth.js';
import walletsRouter from './routes/wallets.js';
import positionsRouter from './routes/positions.js';
import snapshotsRouter from './routes/snapshots.js';
import pnlRouter from './routes/pnl.js';
import pricesRouter from './routes/prices.js';
import settingsRouter from './routes/settings.js';

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/wallets', walletsRouter);
app.use('/api/positions', positionsRouter);
app.use('/api/snapshots', snapshotsRouter);
app.use('/api/pnl', pnlRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/settings', settingsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Production: serve frontend static files
if (process.env.NODE_ENV === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientPath = path.join(__dirname, '../../client');
  app.use(express.static(clientPath));
  app.get('*path', (_req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

export default app;
