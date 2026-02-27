import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../db';

export function federationAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const rawKey = header.slice(7);
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const db = getDb();
  const row = db.prepare('SELECT id FROM api_keys WHERE key_hash = ?').get(keyHash);

  if (!row) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
}
