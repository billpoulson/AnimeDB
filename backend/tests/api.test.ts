import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../src/app';
import { initDb, closeDb } from '../src/db';

vi.mock('../src/services/queue', () => ({
  enqueue: vi.fn(),
}));

vi.mock('../src/services/plexClient', () => ({
  testPlexConnection: vi.fn().mockResolvedValue(false),
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

describe('Downloads API', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    initDb(':memory:');
    request = supertest(createApp());
  });

  afterEach(() => {
    closeDb();
  });

  describe('POST /api/downloads', () => {
    it('creates a download with valid data', async () => {
      const res = await request
        .post('/api/downloads')
        .send({ url: 'https://youtube.com/watch?v=test123', category: 'movies' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('queued');
    });

    it('creates a download with all optional fields', async () => {
      const res = await request.post('/api/downloads').send({
        url: 'https://youtube.com/watch?v=test',
        category: 'tv',
        title: 'My Show',
        season: 2,
        episode: 5,
      });

      expect(res.status).toBe(201);
    });

    it('rejects missing URL', async () => {
      const res = await request
        .post('/api/downloads')
        .send({ category: 'movies' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('url');
    });

    it('rejects non-YouTube URL', async () => {
      const res = await request
        .post('/api/downloads')
        .send({ url: 'https://example.com/video', category: 'movies' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid YouTube URL');
    });

    it('rejects invalid category', async () => {
      const res = await request
        .post('/api/downloads')
        .send({ url: 'https://youtube.com/watch?v=x', category: 'invalid' });

      expect(res.status).toBe(400);
    });

    it('accepts youtu.be short URLs', async () => {
      const res = await request
        .post('/api/downloads')
        .send({ url: 'https://youtu.be/abc123', category: 'other' });

      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/downloads', () => {
    it('returns empty array initially', async () => {
      const res = await request.get('/api/downloads');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns created downloads', async () => {
      await request.post('/api/downloads').send({
        url: 'https://youtube.com/watch?v=one',
        category: 'movies',
        title: 'First',
      });
      await request.post('/api/downloads').send({
        url: 'https://youtube.com/watch?v=two',
        category: 'tv',
      });

      const res = await request.get('/api/downloads');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe('GET /api/downloads/:id', () => {
    it('returns a specific download', async () => {
      const created = await request.post('/api/downloads').send({
        url: 'https://youtube.com/watch?v=test',
        category: 'movies',
        title: 'Test Movie',
      });

      const res = await request.get(`/api/downloads/${created.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Test Movie');
      expect(res.body.category).toBe('movies');
      expect(res.body.status).toBe('queued');
    });

    it('returns 404 for non-existent id', async () => {
      const res = await request.get('/api/downloads/does-not-exist');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/downloads/:id', () => {
    it('deletes a download', async () => {
      const created = await request.post('/api/downloads').send({
        url: 'https://youtube.com/watch?v=del',
        category: 'other',
      });

      const del = await request.delete(`/api/downloads/${created.body.id}`);
      expect(del.status).toBe(204);

      const get = await request.get(`/api/downloads/${created.body.id}`);
      expect(get.status).toBe(404);
    });

    it('returns 404 for non-existent id', async () => {
      const res = await request.delete('/api/downloads/nope');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/config', () => {
    it('returns application config', async () => {
      const res = await request.get('/api/config');

      expect(res.status).toBe(200);
      expect(res.body.outputFormat).toBe('mkv');
      expect(res.body).toHaveProperty('plexConnected');
    });
  });
});
