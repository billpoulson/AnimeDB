import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getDb } from '../db';
import { config } from '../config';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const peers = db.prepare(
    'SELECT id, name, url, instance_id, last_seen, created_at FROM peers ORDER BY created_at DESC'
  ).all();
  res.json(peers);
});

router.post('/', async (req: Request, res: Response) => {
  const { name, url, api_key } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }
  if (!api_key || typeof api_key !== 'string') {
    return res.status(400).json({ error: 'api_key is required' });
  }

  const cleanUrl = url.replace(/\/+$/, '');
  let remoteInstanceId: string | null = null;

  try {
    const probe = await axios.get(`${cleanUrl}/api/federation/library`, {
      headers: { Authorization: `Bearer ${api_key}` },
      timeout: 10000,
    });
    if (!probe.data?.instanceName) {
      return res.status(400).json({ error: 'Remote responded but does not look like an AnimeDB instance' });
    }
    remoteInstanceId = probe.data.instanceId || null;
  } catch (err: any) {
    const msg = err.response?.status === 401
      ? 'Invalid API key (401 from remote)'
      : `Cannot reach remote instance: ${err.message}`;
    return res.status(400).json({ error: msg });
  }

  const id = crypto.randomUUID();
  const db = getDb();
  db.prepare(
    "INSERT INTO peers (id, name, url, api_key, instance_id, last_seen) VALUES (?, ?, ?, ?, ?, datetime('now'))"
  ).run(id, name.trim(), cleanUrl, api_key, remoteInstanceId);

  res.status(201).json({ id, name: name.trim(), url: cleanUrl, instance_id: remoteInstanceId });
});

router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM peers WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(204).send();
});

router.get('/:id/library', async (req: Request, res: Response) => {
  const db = getDb();
  const peer = db.prepare('SELECT * FROM peers WHERE id = ?').get(req.params.id) as any;
  if (!peer) {
    return res.status(404).json({ error: 'Peer not found' });
  }

  try {
    const response = await axios.get(`${peer.url}/api/federation/library`, {
      headers: { Authorization: `Bearer ${peer.api_key}` },
      timeout: 15000,
    });
    res.json(response.data);
  } catch (err: any) {
    const status = err.response?.status || 502;
    res.status(status).json({ error: `Failed to reach peer: ${err.message}` });
  }
});

router.post('/:id/resolve', async (req: Request, res: Response) => {
  const db = getDb();
  const peer = db.prepare('SELECT * FROM peers WHERE id = ?').get(req.params.id) as any;
  if (!peer) {
    return res.status(404).json({ error: 'Peer not found' });
  }
  if (!peer.instance_id) {
    return res.status(400).json({ error: 'Peer has no instance ID -- reconnect to update' });
  }

  const otherPeers = db.prepare(
    'SELECT id, name, url, api_key FROM peers WHERE id != ?'
  ).all(req.params.id) as any[];

  if (otherPeers.length === 0) {
    return res.status(404).json({ error: 'No other peers to ask' });
  }

  for (const other of otherPeers) {
    try {
      const response = await axios.get(
        `${other.url}/api/federation/resolve/${peer.instance_id}`,
        {
          headers: { Authorization: `Bearer ${other.api_key}` },
          timeout: 10000,
        },
      );
      if (response.data?.url) {
        db.prepare(
          "UPDATE peers SET url = ?, last_seen = datetime('now') WHERE id = ?"
        ).run(response.data.url, peer.id);

        const updated = db.prepare(
          'SELECT id, name, url, instance_id, last_seen, created_at FROM peers WHERE id = ?'
        ).get(peer.id);
        return res.json({ resolved: true, via: other.name, peer: updated });
      }
    } catch {
      // try next peer
    }
  }

  res.status(404).json({ error: 'Could not resolve peer URL from any other peer' });
});

router.post('/:id/pull/:downloadId', async (req: Request, res: Response) => {
  const db = getDb();
  const peer = db.prepare('SELECT * FROM peers WHERE id = ?').get(req.params.id) as any;
  if (!peer) {
    return res.status(404).json({ error: 'Peer not found' });
  }

  const remoteId = req.params.downloadId;

  const existing = db.prepare(
    "SELECT id FROM downloads WHERE id = ? AND status = 'completed'"
  ).get(remoteId);
  if (existing) {
    return res.status(409).json({ error: 'Already exists locally' });
  }

  try {
    const libResponse = await axios.get(`${peer.url}/api/federation/library`, {
      headers: { Authorization: `Bearer ${peer.api_key}` },
      timeout: 15000,
    });
    const remoteItem = libResponse.data.items?.find((i: any) => i.id === remoteId);
    if (!remoteItem) {
      return res.status(404).json({ error: 'Item not found on remote peer' });
    }

    const localId = crypto.randomUUID();
    const downloadDir = path.join(config.downloadPath, localId);
    fs.mkdirSync(downloadDir, { recursive: true });

    db.prepare(
      `INSERT INTO downloads (id, url, title, category, season, episode, status, progress)
       VALUES (?, ?, ?, ?, ?, ?, 'downloading', 0)`
    ).run(
      localId,
      `federation://${peer.url}/${remoteId}`,
      remoteItem.title || 'Untitled',
      remoteItem.category || 'other',
      remoteItem.season ?? null,
      remoteItem.episode ?? null,
    );

    res.status(202).json({ id: localId, status: 'downloading' });

    // Stream the file in the background
    (async () => {
      try {
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
        const filename = filenameMatch ? filenameMatch[1] : `${localId}.mkv`;
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
            ).run(progress, localId);
          }
        });

        streamResponse.data.pipe(writer);

        await new Promise<void>((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        db.prepare(
          "UPDATE downloads SET status = 'completed', progress = 100, file_path = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(filePath, localId);
      } catch (err: any) {
        db.prepare(
          "UPDATE downloads SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(err.message || 'Pull failed', localId);
      }
    })();
  } catch (err: any) {
    res.status(502).json({ error: `Failed to reach peer: ${err.message}` });
  }
});

export default router;
