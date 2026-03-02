import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db';
import { config } from '../config';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (config.authDisabled) {
    return next();
  }

  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'password_hash'").get() as { value: string } | undefined;
  if (!row) {
    return next();
  }

  const header = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null;

  if (!header?.startsWith('Bearer ') && !queryToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = queryToken || header!.slice(7);

  // Session token
  const storedToken = db.prepare("SELECT value FROM settings WHERE key = 'session_token'").get() as { value: string } | undefined;
  if (storedToken && storedToken.value === token) {
    return next();
  }

  // API key (long-lived, survives logout)
  if (token.startsWith('adb_')) {
    const keyHash = crypto.createHash('sha256').update(token).digest('hex');
    const keyRow = db.prepare('SELECT id FROM api_keys WHERE key_hash = ?').get(keyHash);
    if (keyRow) {
      return next();
    }
  }

  return res.status(401).json({ error: 'Invalid or expired session' });
}
