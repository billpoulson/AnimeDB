import path from 'path';
import fs from 'fs';
import { config } from './config';
import { initDb } from './db';
import { startQueue } from './services/queue';
import { createApp } from './app';

const dbDir = path.dirname(config.dbPath);
fs.mkdirSync(dbDir, { recursive: true });
fs.mkdirSync(config.downloadPath, { recursive: true });
fs.mkdirSync(config.mediaPath, { recursive: true });

initDb(config.dbPath);
startQueue();

const app = createApp();
app.listen(config.port, () => {
  console.log(`AnimeDB server running on port ${config.port}`);
});
