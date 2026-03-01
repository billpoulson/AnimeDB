import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../src/app';
import { initDb, getDb, closeDb } from '../src/db';

vi.mock('../src/services/queue', () => ({
  enqueue: vi.fn(),
}));

vi.mock('../src/config', () => ({
  config: {
    outputFormat: 'mkv',
    downloadPath: '/downloads',
    mediaPath: '/media',
    dbPath: ':memory:',
    port: 3000,
    authDisabled: true,
    buildSha: 'test',
    githubRepo: 'test/test',
    plex: { url: '', token: '', sectionMovies: 1, sectionTv: 2 },
  },
}));

vi.mock('../src/services/plexClient', () => ({
  testPlexConnection: vi.fn().mockResolvedValue(false),
  triggerPlexScan: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/services/plexAuth', () => ({
  createPlexPin: vi.fn().mockResolvedValue({ authUrl: 'https://app.plex.tv/auth#?code=TEST', code: 'TEST', pinId: 123 }),
  pollPlexPin: vi.fn().mockResolvedValue({ token: null }),
  getPlexServers: vi.fn().mockResolvedValue([{ name: 'My Plex', uri: 'http://192.168.1.50:32400' }]),
  getPlexSections: vi.fn().mockResolvedValue([
    { id: 1, title: 'Movies', type: 'movie' },
    { id: 2, title: 'TV Shows', type: 'show' },
  ]),
}));

describe('Settings API', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    vi.resetModules();
    initDb(':memory:');
    request = supertest(createApp());
  });

  afterEach(() => {
    closeDb();
  });

  describe('GET /api/settings/plex', () => {
    it('returns default settings when nothing is configured', async () => {
      const res = await request.get('/api/settings/plex');
      expect(res.status).toBe(200);
      expect(res.body.url).toBe('');
      expect(res.body.token).toBe('');
      expect(res.body.hasToken).toBe(false);
      expect(res.body.sectionMovies).toBe(1);
      expect(res.body.sectionTv).toBe(2);
    });

    it('returns saved settings with masked token', async () => {
      const db = getDb();
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('plex_url', 'http://myserver:32400');
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('plex_token', 'abcdefghijklmnop');
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('plex_section_movies', '3');
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('plex_section_tv', '5');

      const res = await request.get('/api/settings/plex');
      expect(res.status).toBe(200);
      expect(res.body.url).toBe('http://myserver:32400');
      expect(res.body.token).not.toBe('abcdefghijklmnop');
      expect(res.body.token).toContain('***');
      expect(res.body.hasToken).toBe(true);
      expect(res.body.sectionMovies).toBe(3);
      expect(res.body.sectionTv).toBe(5);
    });
  });

  describe('PUT /api/settings/plex', () => {
    it('saves plex settings', async () => {
      const res = await request
        .put('/api/settings/plex')
        .send({ url: 'http://plex:32400', token: 'my-secret-token', sectionMovies: 2, sectionTv: 4 });

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('http://plex:32400');
      expect(res.body.hasToken).toBe(true);
      expect(res.body.sectionMovies).toBe(2);
      expect(res.body.sectionTv).toBe(4);

      const db = getDb();
      const row = db.prepare("SELECT value FROM settings WHERE key = 'plex_url'").get() as any;
      expect(row.value).toBe('http://plex:32400');
    });

    it('partial update preserves existing values', async () => {
      await request
        .put('/api/settings/plex')
        .send({ url: 'http://plex:32400', token: 'tok123', sectionMovies: 1, sectionTv: 2 });

      const res = await request
        .put('/api/settings/plex')
        .send({ sectionMovies: 7 });

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('http://plex:32400');
      expect(res.body.sectionMovies).toBe(7);
      expect(res.body.sectionTv).toBe(2);
    });

    it('clears plex settings when empty strings are sent', async () => {
      await request
        .put('/api/settings/plex')
        .send({ url: 'http://plex:32400', token: 'tok' });

      const res = await request
        .put('/api/settings/plex')
        .send({ url: '', token: '' });

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('');
      expect(res.body.hasToken).toBe(false);
    });
  });

  describe('POST /api/settings/plex/test', () => {
    it('returns 400 when url is missing', async () => {
      const res = await request
        .post('/api/settings/plex/test')
        .send({ token: 'tok' });

      expect(res.status).toBe(400);
      expect(res.body.connected).toBe(false);
    });

    it('returns 400 when token is missing and no saved token', async () => {
      const res = await request
        .post('/api/settings/plex/test')
        .send({ url: 'http://plex:32400' });

      expect(res.status).toBe(400);
    });

    it('calls testPlexConnection with provided url and token', async () => {
      const { testPlexConnection } = await import('../src/services/plexClient');
      vi.mocked(testPlexConnection).mockResolvedValue(true);

      const res = await request
        .post('/api/settings/plex/test')
        .send({ url: 'http://plex:32400', token: 'my-token' });

      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
      expect(testPlexConnection).toHaveBeenCalledWith('http://plex:32400', 'my-token');
    });

    it('uses saved token when __use_saved__ is sent', async () => {
      const db = getDb();
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('plex_token', 'saved-secret');

      const { testPlexConnection } = await import('../src/services/plexClient');
      vi.mocked(testPlexConnection).mockResolvedValue(true);

      const res = await request
        .post('/api/settings/plex/test')
        .send({ url: 'http://plex:32400', token: '__use_saved__' });

      expect(res.status).toBe(200);
      expect(testPlexConnection).toHaveBeenCalledWith('http://plex:32400', 'saved-secret');
    });
  });

  describe('POST /api/settings/plex/pin', () => {
    it('returns authUrl, code, pinId', async () => {
      const res = await request.post('/api/settings/plex/pin');
      expect(res.status).toBe(200);
      expect(res.body.authUrl).toContain('plex.tv');
      expect(res.body.code).toBe('TEST');
      expect(res.body.pinId).toBe(123);
    });

    it('returns 500 when createPlexPin throws', async () => {
      const { createPlexPin } = await import('../src/services/plexAuth');
      vi.mocked(createPlexPin).mockRejectedValueOnce(new Error('Plex unavailable'));

      const res = await request.post('/api/settings/plex/pin');
      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/settings/plex/pin/:pinId', () => {
    it('returns token when code provided', async () => {
      const { pollPlexPin } = await import('../src/services/plexAuth');
      vi.mocked(pollPlexPin).mockResolvedValueOnce({ token: 'auth-token-xyz', expiresAt: '2025-01-01' });

      const res = await request.get('/api/settings/plex/pin/123').query({ code: 'TEST' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBe('auth-token-xyz');
      expect(pollPlexPin).toHaveBeenCalledWith(123, 'TEST');
    });

    it('returns 400 when code missing', async () => {
      const res = await request.get('/api/settings/plex/pin/123');
      expect(res.status).toBe(400);
      expect(res.body.token).toBeNull();
    });

    it('returns 400 when pinId invalid', async () => {
      const res = await request.get('/api/settings/plex/pin/abc').query({ code: 'TEST' });
      expect(res.status).toBe(400);
      expect(res.body.token).toBeNull();
    });

    it('returns 500 when pollPlexPin throws', async () => {
      const { pollPlexPin } = await import('../src/services/plexAuth');
      vi.mocked(pollPlexPin).mockRejectedValueOnce(new Error('Plex error'));

      const res = await request.get('/api/settings/plex/pin/123').query({ code: 'TEST' });
      expect(res.status).toBe(500);
      expect(res.body.token).toBeNull();
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/settings/plex/servers', () => {
    it('returns server list when token provided', async () => {
      const res = await request.get('/api/settings/plex/servers').query({ plexToken: 'my-token' });
      expect(res.status).toBe(200);
      expect(res.body.servers).toEqual([{ name: 'My Plex', uri: 'http://192.168.1.50:32400' }]);
    });

    it('returns 400 when token missing', async () => {
      const res = await request.get('/api/settings/plex/servers');
      expect(res.status).toBe(400);
    });

    it('returns 500 when getPlexServers throws', async () => {
      const { getPlexServers } = await import('../src/services/plexAuth');
      vi.mocked(getPlexServers).mockRejectedValueOnce(new Error('Invalid token'));

      const res = await request.get('/api/settings/plex/servers').query({ plexToken: 'bad' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/settings/plex/sections', () => {
    it('returns sections when plexUrl and plexToken provided', async () => {
      const res = await request
        .get('/api/settings/plex/sections')
        .query({ plexUrl: 'http://plex:32400', plexToken: 'my-token' });
      expect(res.status).toBe(200);
      expect(res.body.sections).toEqual([
        { id: 1, title: 'Movies', type: 'movie' },
        { id: 2, title: 'TV Shows', type: 'show' },
      ]);
    });

    it('uses saved settings when params omitted', async () => {
      const db = getDb();
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('plex_url', 'http://saved:32400');
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('plex_token', 'saved-token');

      const res = await request.get('/api/settings/plex/sections');
      expect(res.status).toBe(200);
      expect(res.body.sections).toHaveLength(2);

      const { getPlexSections } = await import('../src/services/plexAuth');
      expect(getPlexSections).toHaveBeenCalledWith('http://saved:32400', 'saved-token', false);
    });

    it('returns 400 when no url/token and Plex not configured', async () => {
      const res = await request.get('/api/settings/plex/sections');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('passes refresh=true when requested', async () => {
      const db = getDb();
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('plex_url', 'http://plex:32400');
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('plex_token', 'tok');

      const res = await request.get('/api/settings/plex/sections').query({ refresh: 'true' });
      expect(res.status).toBe(200);

      const { getPlexSections } = await import('../src/services/plexAuth');
      expect(getPlexSections).toHaveBeenCalledWith('http://plex:32400', 'tok', true);
    });

    it('returns 500 when getPlexSections throws', async () => {
      const { getPlexSections } = await import('../src/services/plexAuth');
      vi.mocked(getPlexSections).mockRejectedValueOnce(new Error('Plex unreachable'));

      const res = await request
        .get('/api/settings/plex/sections')
        .query({ plexUrl: 'http://plex:32400', plexToken: 'tok' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/config', () => {
    it('includes plexConnected status from settings', async () => {
      const res = await request.get('/api/config');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('plexConnected');
      expect(res.body).toHaveProperty('outputFormat');
      expect(res.body).toHaveProperty('plexUrl');
    });
  });
});
