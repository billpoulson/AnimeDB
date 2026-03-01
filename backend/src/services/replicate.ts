import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getDb } from '../db';
import { config } from '../config';
import { createLogger } from './logger';

const log = createLogger('replicate');

export interface ReplicateResult {
  queued: number;
  skipped: number;
  total: number;
}

/**
 * Fetch remote library, queue new items, and process them in the background.
 * Used by both POST /replicate and the peer sync service.
 */
export async function runReplicateForPeer(
  peer: { id: string; name: string; url: string; api_key: string },
  libraryId?: string | null,
): Promise<ReplicateResult> {
  const db = getDb();

  if (libraryId) {
    const lib = db.prepare('SELECT id FROM libraries WHERE id = ?').get(libraryId);
    if (!lib) {
      throw new Error('Library not found');
    }
  }

  let remoteItems: { id: string; title?: string; category?: string; season?: number; episode?: number }[];
  try {
    const libResponse = await axios.get(`${peer.url}/api/federation/library`, {
      headers: { Authorization: `Bearer ${peer.api_key}` },
      timeout: 15000,
    });
    remoteItems = libResponse.data.items || [];
  } catch (err: any) {
    throw new Error(`Failed to reach peer: ${err.message}`);
  }

  if (remoteItems.length === 0) {
    return { queued: 0, skipped: 0, total: 0 };
  }

  let queued = 0;
  let skipped = 0;

  for (const remoteItem of remoteItems) {
    const federationUrl = `federation://${peer.url}/${remoteItem.id}`;
    const existing = db.prepare(
      "SELECT id FROM downloads WHERE url = ? AND status IN ('completed','downloading','queued')"
    ).get(federationUrl);
    if (existing) {
      skipped++;
      continue;
    }

    const localId = crypto.randomUUID();
    const downloadDir = path.join(config.downloadPath, localId);
    fs.mkdirSync(downloadDir, { recursive: true });

    db.prepare(
      `INSERT INTO downloads (id, url, title, category, season, episode, status, progress)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', 0)`
    ).run(
      localId,
      federationUrl,
      remoteItem.title || 'Untitled',
      remoteItem.category || 'other',
      remoteItem.season ?? null,
      remoteItem.episode ?? null,
    );

    queued++;
  }

  if (queued > 0) {
    log.info(`Replicate started: ${queued} items from ${peer.name} (skipped ${skipped})`);

    processReplicateQueue(peer, libraryId || null).catch((err) =>
      log.error(`Replicate from ${peer.name} failed: ${err.message}`),
    );
  }

  return { queued, skipped, total: remoteItems.length };
}

async function processReplicateQueue(
  peer: { id: string; name: string; url: string; api_key: string },
  libraryId: string | null,
): Promise<void> {
  const db = getDb();
  const pendingItems = db.prepare(
    `SELECT id, url FROM downloads WHERE url LIKE ? AND status = 'queued' ORDER BY created_at ASC`
  ).all(`federation://${peer.url}/%`) as { id: string; url: string }[];

  for (const item of pendingItems) {
    const remoteId = item.url.split('/').pop();
    try {
      db.prepare(
        "UPDATE downloads SET status = 'downloading', updated_at = datetime('now') WHERE id = ?"
      ).run(item.id);

      const streamResponse = await axios.get(
        `${peer.url}/api/federation/download/${remoteId}/stream`,
        {
          headers: { Authorization: `Bearer ${peer.api_key}` },
          responseType: 'stream',
          timeout: 0,
        },
      );

      const disposition = streamResponse.headers['content-disposition'] || '';
      const filenameMatch = disposition.match(/filename="(.+?)"/);
      const filename = filenameMatch ? filenameMatch[1] : `${item.id}.mkv`;
      const downloadDir = path.join(config.downloadPath, item.id);
      fs.mkdirSync(downloadDir, { recursive: true });
      const filePath = path.join(downloadDir, filename);

      const writer = fs.createWriteStream(filePath);
      const totalBytes = parseInt(streamResponse.headers['content-length'] || '0', 10);
      let receivedBytes = 0;

      streamResponse.data.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length;
        if (totalBytes > 0) {
          const progress = Math.round((receivedBytes / totalBytes) * 100);
          db.prepare(
            "UPDATE downloads SET progress = ?, updated_at = datetime('now') WHERE id = ?"
          ).run(progress, item.id);
        }
      });

      streamResponse.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      db.prepare(
        "UPDATE downloads SET status = 'completed', progress = 100, file_path = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(filePath, item.id);

      if (libraryId) {
        try {
          const dl = db.prepare('SELECT * FROM downloads WHERE id = ?').get(item.id) as any;
          const library = db.prepare('SELECT * FROM libraries WHERE id = ?').get(libraryId) as any;
          if (library) {
            const title = dl.title || path.basename(filePath).replace(/\.[^.]+$/, '');
            const category = library.type || dl.category;
            const { moveToLibrary } = await import('./mediaOrganizer');
            const targetPath = await moveToLibrary(filePath, {
              title,
              category,
              season: dl.season ?? undefined,
              episode: dl.episode ?? undefined,
            }, library.path);

            db.prepare(
              "UPDATE downloads SET file_path = ?, moved_to_library = 1, library_id = ?, updated_at = datetime('now') WHERE id = ?"
            ).run(targetPath, libraryId, item.id);

            const { triggerPlexScan } = await import('./plexClient');
            triggerPlexScan(category, library.plex_section_id).catch(() => {});
          }
        } catch (moveErr: any) {
          log.error(`Replicate auto-move failed for ${item.id}: ${moveErr.message}`);
        }
      }

      log.info(`Replicated: ${remoteId} -> ${item.id}`);
    } catch (err: any) {
      try {
        db.prepare(
          "UPDATE downloads SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(err.message || 'Replicate pull failed', item.id);
      } catch { /* DB may be closed during shutdown */ }
      log.error(`Replicate failed for ${remoteId}: ${err.message}`);
    }
  }

  log.info(`Replicate from ${peer.name} complete`);
}
