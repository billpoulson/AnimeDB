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
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.slice(7);
  const storedToken = db.prepare("SELECT value FROM settings WHERE key = 'session_token'").get() as { value: string } | undefined;

  if (!storedToken || storedToken.value !== token) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  next();
}
