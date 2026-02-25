import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db';
import { enqueue } from '../services/queue';
import { cancelDownload } from '../services/downloader';
import { moveToLibrary } from '../services/mediaOrganizer';
import { triggerPlexScan } from '../services/plexClient';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  const { url, category = 'other', title, season, episode } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url)) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  const validCategories = ['movies', 'tv', 'other'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: 'category must be movies, tv, or other' });
  }

  const id = crypto.randomUUID();
  const db = getDb();

  db.prepare(
    `INSERT INTO downloads (id, url, title, category, season, episode) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, url, title || null, category, season || null, episode || null);

  enqueue(id);

  res.status(201).json({ id, status: 'queued' });
});

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const downloads = db.prepare(
    'SELECT * FROM downloads ORDER BY created_at DESC'
  ).all();
  res.json(downloads);
});

router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const download = db.prepare(
    'SELECT * FROM downloads WHERE id = ?'
  ).get(req.params.id);

  if (!download) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json(download);
});

router.post('/:id/cancel', (req: Request, res: Response) => {
  const db = getDb();
  const download = db.prepare(
    'SELECT * FROM downloads WHERE id = ?'
  ).get(req.params.id) as any;

  if (!download) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (download.status === 'downloading') {
    cancelDownload(download.id);
    res.json({ id: download.id, status: 'cancelled' });
  } else if (download.status === 'queued') {
    db.prepare(
      `UPDATE downloads SET status = 'cancelled', error = 'Cancelled by user', updated_at = datetime('now') WHERE id = ?`
    ).run(download.id);
    res.json({ id: download.id, status: 'cancelled' });
  } else {
    return res.status(400).json({ error: `Cannot cancel download with status: ${download.status}` });
  }
});

router.post('/:id/move', async (req: Request, res: Response) => {
  const db = getDb();
  const download = db.prepare(
    'SELECT * FROM downloads WHERE id = ?'
  ).get(req.params.id) as any;

  if (!download) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (download.status !== 'completed') {
    return res.status(400).json({ error: 'Download is not completed' });
  }

  if (download.moved_to_library) {
    return res.status(400).json({ error: 'Already moved to library' });
  }

  if (!download.file_path || !fs.existsSync(download.file_path)) {
    return res.status(400).json({ error: 'Source file not found' });
  }

  try {
    const title = download.title || path.basename(download.file_path).replace(/\.[^.]+$/, '');
    const targetPath = await moveToLibrary(download.file_path, {
      title,
      category: download.category,
      season: download.season ?? undefined,
      episode: download.episode ?? undefined,
    });

    db.prepare(
      `UPDATE downloads SET file_path = ?, moved_to_library = 1, updated_at = datetime('now') WHERE id = ?`
    ).run(targetPath, download.id);

    triggerPlexScan(download.category).catch(() => {});

    res.json({ id: download.id, file_path: targetPath, moved_to_library: 1 });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to move file' });
  }
});

const MIME_TYPES: Record<string, string> = {
  '.mkv': 'video/x-matroska',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
};

router.get('/:id/stream', (req: Request, res: Response) => {
  const db = getDb();
  const download = db.prepare(
    'SELECT * FROM downloads WHERE id = ? AND status = ?'
  ).get(req.params.id, 'completed') as any;

  if (!download?.file_path || !fs.existsSync(download.file_path)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const filePath = download.file_path;
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const result = db.prepare(
    'DELETE FROM downloads WHERE id = ?'
  ).run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(204).send();
});

export default router;
