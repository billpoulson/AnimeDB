import axios from 'axios';
import { getDb, getInstanceId } from '../db';
import { getExternalUrl } from './upnp';

export async function announceToAllPeers(): Promise<void> {
  const url = getExternalUrl();
  if (!url) {
    console.log('Skipping announce: no external URL configured');
    return;
  }

  const instanceId = getInstanceId();
  const db = getDb();
  const peers = db.prepare('SELECT id, name, url, api_key FROM peers').all() as any[];

  if (peers.length === 0) return;

  console.log(`Announcing URL ${url} to ${peers.length} peer(s)...`);

  const results = await Promise.allSettled(
    peers.map(async (peer) => {
      try {
        const res = await axios.post(
          `${peer.url}/api/federation/announce`,
          { instanceId, url },
          {
            headers: { Authorization: `Bearer ${peer.api_key}` },
            timeout: 10000,
          },
        );
        if (res.data?.updated) {
          console.log(`  ${peer.name}: updated`);
        } else {
          console.log(`  ${peer.name}: acknowledged (not tracked)`);
        }
      } catch (err: any) {
        console.warn(`  ${peer.name}: failed (${err.message})`);
      }
    }),
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  console.log(`Announce complete: ${succeeded}/${peers.length} peers notified`);
}
