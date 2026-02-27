import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../src/app';
import { initDb, closeDb } from '../src/db';

vi.mock('../src/services/queue', () => ({ enqueue: vi.fn() }));
vi.mock('../src/services/plexClient', () => ({
  testPlexConnection: vi.fn().mockResolvedValue(false),
}));
vi.mock('../src/services/upnp', () => ({
  getUpnpState: vi.fn().mockReturnValue({ active: false, externalIp: null, externalUrl: null, error: null }),
  getExternalUrl: vi.fn().mockReturnValue(null),
  setManualExternalUrl: vi.fn(),
}));
vi.mock('../src/config', () => ({
  config: {
    outputFormat: 'mkv',
    downloadPath: '/downloads',
    mediaPath: '/media',
    dbPath: ':memory:',
    port: 3000,
    instanceName: 'TestInstance',
    externalUrl: '',
    plex: { url: '', token: '', sectionMovies: 1, sectionTv: 2 },
  },
}));

describe('API Keys', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    initDb(':memory:');
    request = supertest(createApp());
  });

  afterEach(() => {
    closeDb();
  });

  describe('GET /api/keys', () => {
    it('returns empty array initially', async () => {
      const res = await request.get('/api/keys');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /api/keys', () => {
    it('creates a key with a label', async () => {
      const res = await request.post('/api/keys').send({ label: 'Test Key' });

      expect(res.status).toBe(201);
      expect(res.body.label).toBe('Test Key');
      expect(res.body.key).toMatch(/^adb_[0-9a-f]{64}$/);
      expect(res.body).toHaveProperty('id');
    });

    it('trims whitespace from the label', async () => {
      const res = await request.post('/api/keys').send({ label: '  Spaced  ' });
      expect(res.status).toBe(201);
      expect(res.body.label).toBe('Spaced');
    });

    it('rejects missing label', async () => {
      const res = await request.post('/api/keys').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('label');
    });

    it('rejects non-string label', async () => {
      const res = await request.post('/api/keys').send({ label: 123 });
      expect(res.status).toBe(400);
    });

    it('generated key appears in listing (without raw key)', async () => {
      const created = await request.post('/api/keys').send({ label: 'Listed' });
      const list = await request.get('/api/keys');

      expect(list.body).toHaveLength(1);
      expect(list.body[0].label).toBe('Listed');
      expect(list.body[0].id).toBe(created.body.id);
      expect(list.body[0]).not.toHaveProperty('key');
      expect(list.body[0]).not.toHaveProperty('key_hash');
    });
  });

  describe('DELETE /api/keys/:id', () => {
    it('deletes an existing key', async () => {
      const created = await request.post('/api/keys').send({ label: 'ToDelete' });
      const del = await request.delete(`/api/keys/${created.body.id}`);
      expect(del.status).toBe(204);

      const list = await request.get('/api/keys');
      expect(list.body).toHaveLength(0);
    });

    it('returns 404 for non-existent key', async () => {
      const res = await request.delete('/api/keys/nonexistent');
      expect(res.status).toBe(404);
    });
  });
});
