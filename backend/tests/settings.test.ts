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
