import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getDb, getInstanceId } from '../db';
import { federationAuth } from '../middleware/federationAuth';
import { config } from '../config';
import { createLogger } from '../services/logger';

const router = Router();
const log = createLogger('federation');

router.use(federationAuth);

router.get('/library', (_req: Request, res: Response) => {
  const db = getDb();
  const downloads = db.prepare(
    `SELECT id, title, category, season, episode, status, created_at
     FROM downloads WHERE status = 'completed' AND url NOT LIKE 'federation://%'
     ORDER BY created_at DESC`
  ).all();

  res.json({
    instanceId: getInstanceId(),
    instanceName: config.instanceName,
    items: downloads,
  });
});

router.post('/announce', (req: Request, res: Response) => {
  const { instanceId, url } = req.body;

  if (!instanceId || typeof instanceId !== 'string') {
    return res.status(400).json({ error: 'instanceId is required' });
  }
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  const db = getDb();
  const result = db.prepare(
    "UPDATE peers SET url = ?, last_seen = datetime('now') WHERE instance_id = ?"
  ).run(url.replace(/\/+$/, ''), instanceId);

  if (result.changes === 0) {
    log.info(`Announce from unknown instance ${instanceId}`);
    return res.json({ updated: false, message: 'No peer with that instance ID' });
  }

  log.info(`Announce accepted: instance ${instanceId} -> ${url.replace(/\/+$/, '')}`);
  res.json({ updated: true });
});

router.get('/resolve/:instanceId', (req: Request, res: Response) => {
  const db = getDb();
  const peer = db.prepare(
    'SELECT url, name, instance_id, last_seen FROM peers WHERE instance_id = ?'
  ).get(req.params.instanceId) as any;

  if (!peer) {
    return res.status(404).json({ error: 'Unknown instance' });
  }

  res.json({
    instanceId: peer.instance_id,
    name: peer.name,
    url: peer.url,
    lastSeen: peer.last_seen,
  });
});

const MIME_TYPES: Record<string, string> = {
  '.mkv': 'video/x-matroska',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
};

router.get('/download/:id/stream', (req: Request, res: Response) => {
  const db = getDb();
  const download = db.prepare(
    "SELECT * FROM downloads WHERE id = ? AND status = 'completed'"
  ).get(req.params.id) as any;

  if (!download?.file_path || !fs.existsSync(download.file_path)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const filePath = download.file_path;
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);

  log.info(`Streaming file ${path.basename(filePath)} (${(stat.size / 1048576).toFixed(1)} MB)`);
  fs.createReadStream(filePath).pipe(res);
});

export default router;
