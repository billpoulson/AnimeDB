import path from 'path';
import fs from 'fs';
import { config } from './config';
import { initDb, getInstanceId } from './db';
import { startQueue } from './services/queue';
import { createApp } from './app';
import { startUpnp, stopUpnp } from './services/upnp';
import { announceToAllPeers } from './services/announce';

const dbDir = path.dirname(config.dbPath);
fs.mkdirSync(dbDir, { recursive: true });
fs.mkdirSync(config.downloadPath, { recursive: true });
fs.mkdirSync(config.mediaPath, { recursive: true });

initDb(config.dbPath);
console.log(`Instance ID: ${getInstanceId()}`);
startQueue();

const app = createApp();
app.listen(config.port, () => {
  console.log(`AnimeDB server running on port ${config.port}`);
  startUpnp()
    .then(() => announceToAllPeers())
    .catch((err) => {
      console.warn('Startup network error:', err.message);
    });
});

const shutdown = async () => {
  await stopUpnp();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
