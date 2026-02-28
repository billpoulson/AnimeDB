import { Router, Request, Response } from 'express';
import { getPlexSettings, savePlexSettings } from '../services/settings';
import { testPlexConnection } from '../services/plexClient';

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

export default router;
