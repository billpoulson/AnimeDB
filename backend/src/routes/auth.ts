import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../db';
import { config } from '../config';

const router = Router();

function getSetting(key: string): string | undefined {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function deleteSetting(key: string): void {
  const db = getDb();
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve(`${salt}:${derived.toString('hex')}`);
    });
  });
}

function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, hash] = stored.split(':');
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve(crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derived));
    });
  });
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

router.get('/status', (req: Request, res: Response) => {
  const passwordHash = getSetting('password_hash');
  const setup = !!passwordHash;
  const authRequired = !config.authDisabled;

  let authenticated = false;
  if (!authRequired) {
    authenticated = true;
  } else if (setup) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const token = header.slice(7);
      const storedToken = getSetting('session_token');
      authenticated = !!storedToken && storedToken === token;
    }
  }

  res.json({ setup, authenticated, authRequired });
});

router.post('/setup', async (req: Request, res: Response) => {
  const existing = getSetting('password_hash');
  if (existing) {
    return res.status(400).json({ error: 'Password already configured' });
  }

  const { password } = req.body;
  if (!password || typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const hash = await hashPassword(password);
  setSetting('password_hash', hash);

  const token = generateToken();
  setSetting('session_token', token);

  res.json({ token });
});

router.post('/login', async (req: Request, res: Response) => {
  const stored = getSetting('password_hash');
  if (!stored) {
    return res.status(400).json({ error: 'No password configured. Use setup first.' });
  }

  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }

  const valid = await verifyPassword(password, stored);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = generateToken();
  setSetting('session_token', token);

  res.json({ token });
});

router.post('/logout', (_req: Request, res: Response) => {
  deleteSetting('session_token');
  res.json({ ok: true });
});

router.post('/change-password', async (req: Request, res: Response) => {
  const stored = getSetting('password_hash');
  if (!stored) {
    return res.status(400).json({ error: 'No password configured' });
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || typeof currentPassword !== 'string') {
    return res.status(400).json({ error: 'Current password is required' });
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  const valid = await verifyPassword(currentPassword, stored);
  if (!valid) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = await hashPassword(newPassword);
  setSetting('password_hash', hash);

  const token = generateToken();
  setSetting('session_token', token);

  res.json({ token });
});

export default router;
