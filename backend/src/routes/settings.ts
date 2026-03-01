import { Router, Request, Response } from 'express';
import { getPlexSettings, savePlexSettings } from '../services/settings';
import { testPlexConnection } from '../services/plexClient';
import { createPlexPin, pollPlexPin, getPlexServers, getPlexSections } from '../services/plexAuth';

const router = Router();

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 6) return '******';
  return token.slice(0, 3) + '*'.repeat(token.length - 6) + token.slice(-3);
}

router.get('/plex', (_req: Request, res: Response) => {
  const settings = getPlexSettings();
  res.json({
    url: settings.url,
    token: maskToken(settings.token),
    sectionMovies: settings.sectionMovies,
    sectionTv: settings.sectionTv,
    hasToken: !!settings.token,
  });
});

router.put('/plex', (req: Request, res: Response) => {
  const { url, token, sectionMovies, sectionTv } = req.body;

  const update: Record<string, any> = {};
  if (url !== undefined) update.url = String(url).trim();
  if (token !== undefined) update.token = String(token);
  if (sectionMovies !== undefined) update.sectionMovies = parseInt(sectionMovies, 10) || 1;
  if (sectionTv !== undefined) update.sectionTv = parseInt(sectionTv, 10) || 2;

  const saved = savePlexSettings(update);
  res.json({
    url: saved.url,
    token: maskToken(saved.token),
    sectionMovies: saved.sectionMovies,
    sectionTv: saved.sectionTv,
    hasToken: !!saved.token,
  });
});

router.post('/plex/test', async (req: Request, res: Response) => {
  const { url, token } = req.body;

  if (!url) {
    return res.status(400).json({ connected: false, error: 'URL is required' });
  }

  const resolvedToken = token === '__use_saved__' ? getPlexSettings().token : token;
  if (!resolvedToken) {
    return res.status(400).json({ connected: false, error: 'Token is required' });
  }

  try {
    const connected = await testPlexConnection(String(url).trim(), String(resolvedToken));
    res.json({ connected, error: connected ? null : 'Could not connect to Plex server' });
  } catch (err: any) {
    res.json({ connected: false, error: err.message });
  }
});

router.post('/plex/pin', async (_req: Request, res: Response) => {
  try {
    const { authUrl, code, pinId } = await createPlexPin();
    res.json({ authUrl, code, pinId });
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data ?? err.message });
  }
});

router.get('/plex/pin/:pinId', async (req: Request, res: Response) => {
  const pinId = parseInt(String(req.params.pinId ?? ''), 10);
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!pinId || !code) {
    return res.status(400).json({ token: null, error: 'pinId and code are required' });
  }
  try {
    const { token, expiresAt } = await pollPlexPin(pinId, code);
    res.json({ token, expiresAt });
  } catch (err: any) {
    res.status(500).json({ token: null, error: err.response?.data ?? err.message });
  }
});

router.get('/plex/servers', async (req: Request, res: Response) => {
  // Use plexToken to avoid conflicting with auth middleware's req.query.token (session)
  const plexToken = typeof req.query.plexToken === 'string' ? req.query.plexToken : '';
  if (!plexToken) {
    return res.status(400).json({ error: 'plexToken is required' });
  }
  try {
    const servers = await getPlexServers(plexToken);
    res.json({ servers });
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data ?? err.message });
  }
});

router.get('/plex/sections', async (req: Request, res: Response) => {
  const plexUrl = typeof req.query.plexUrl === 'string' ? req.query.plexUrl.trim() : '';
  const plexToken = typeof req.query.plexToken === 'string' ? req.query.plexToken : '';
  const refresh = req.query.refresh === 'true';

  let url = plexUrl;
  let token = plexToken;

  if (!url || !token) {
    const saved = getPlexSettings();
    url = url || saved.url || '';
    token = token || saved.token || '';
  }

  if (!url || !token) {
    return res.status(400).json({ error: 'Plex URL and token are required. Configure Plex first or pass plexUrl and plexToken.' });
  }

  try {
    const sections = await getPlexSections(url, token, refresh);
    res.json({ sections });
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data ?? err.message });
  }
});

export default router;
