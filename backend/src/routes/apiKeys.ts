import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../db';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const keys = db.prepare(
    'SELECT id, label, created_at FROM api_keys ORDER BY created_at DESC'
  ).all();
  res.json(keys);
});

router.post('/', (req: Request, res: Response) => {
  const { label } = req.body;
  if (!label || typeof label !== 'string') {
    return res.status(400).json({ error: 'label is required' });
  }

  const id = crypto.randomUUID();
  const rawKey = `adb_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const db = getDb();
  db.prepare(
    'INSERT INTO api_keys (id, label, key_hash) VALUES (?, ?, ?)'
  ).run(id, label.trim(), keyHash);

  res.status(201).json({ id, label: label.trim(), key: rawKey });
});

router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(204).send();
});

export default router;
