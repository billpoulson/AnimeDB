import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import authRouter from './routes/auth';
import downloadsRouter from './routes/downloads';
import librariesRouter from './routes/libraries';
import federationRouter from './routes/federation';
import peersRouter from './routes/peers';
import apiKeysRouter from './routes/apiKeys';
import networkingRouter from './routes/networking';
import systemRouter from './routes/system';
import settingsRouter from './routes/settings';
import { authMiddleware } from './middleware/auth';
import { testPlexConnection } from './services/plexClient';
import { getPlexSettings } from './services/settings';
import { config } from './config';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRouter);
  app.use('/api/federation', federationRouter);

  app.use('/api', authMiddleware);

  app.use('/api/downloads', downloadsRouter);
  app.use('/api/libraries', librariesRouter);
  app.use('/api/peers', peersRouter);
  app.use('/api/keys', apiKeysRouter);
  app.use('/api/networking', networkingRouter);
  app.use('/api/system', systemRouter);
  app.use('/api/settings', settingsRouter);

  app.get('/api/config', async (_req, res) => {
    const plex = getPlexSettings();
    const plexConnected = await testPlexConnection();
    res.json({
      outputFormat: config.outputFormat,
      plexConnected,
      plexUrl: plex.url || null,
    });
  });

  const frontendDist = path.join(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.use((_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  return app;
}
