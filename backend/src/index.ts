import path from 'path';
import fs from 'fs';
import { config } from './config';
import { initDb, getInstanceId } from './db';
import { startQueue } from './services/queue';
import { createApp } from './app';
import { startUpnp, stopUpnp, onRenew } from './services/upnp';
import { announceToAllPeers } from './services/announce';
import { createLogger } from './services/logger';
import { checkRollback, cleanupAfterSuccessfulUpdate } from './services/rollback';

const log = createLogger('app');

const rollbackResult = checkRollback();
if (rollbackResult === 'rolled_back') {
  process.exit(1);
}

const dbDir = path.dirname(config.dbPath);
fs.mkdirSync(dbDir, { recursive: true });
fs.mkdirSync(config.downloadPath, { recursive: true });
fs.mkdirSync(config.mediaPath, { recursive: true });

initDb(config.dbPath);
log.info(`Instance ID: ${getInstanceId()}`);
startQueue();

onRenew(() => {
  announceToAllPeers().catch((err) => log.warn(`Post-renewal announce failed: ${err.message}`));
});

const app = createApp();
app.listen(config.port, () => {
  log.info(`AnimeDB server running on port ${config.port}`);
  cleanupAfterSuccessfulUpdate();

  startUpnp()
    .then(() => announceToAllPeers())
    .catch((err) => {
      log.warn(`Startup network error: ${err.message}`);
    });
});

const shutdown = async () => {
  log.info('Shutting down...');
  await stopUpnp();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
