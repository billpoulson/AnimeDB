import { getDb } from '../db';
import { config } from '../config';
import { createLogger } from './logger';
import { runReplicateForPeer } from './replicate';

const log = createLogger('peerSync');

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startPeerSync(): void {
  if (intervalId) return;

  const ms = config.peerSyncIntervalMinutes * 60 * 1000;
  log.info(`Peer sync started (interval: ${config.peerSyncIntervalMinutes} min)`);

  const runSync = async () => {
    const db = getDb();
    const peers = db.prepare(
      'SELECT id, name, url, api_key, sync_library_id FROM peers WHERE auto_replicate = 1'
    ).all() as { id: string; name: string; url: string; api_key: string; sync_library_id: string | null }[];

    if (peers.length === 0) return;

    for (const peer of peers) {
      try {
        const result = await runReplicateForPeer(peer, peer.sync_library_id);
        if (result.queued > 0) {
          log.info(`Auto-sync ${peer.name}: ${result.queued} new, ${result.skipped} already local`);
        }
      } catch (err: any) {
        log.warn(`Auto-sync ${peer.name} failed: ${err.message}`);
      }
    }
  };

  intervalId = setInterval(() => {
    runSync().catch((err) => log.error(`Peer sync error: ${err.message}`));
  }, ms);

  runSync().catch((err) => log.error(`Peer sync initial run: ${err.message}`));
}

export function stopPeerSync(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    log.info('Peer sync stopped');
  }
}
