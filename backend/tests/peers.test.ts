import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { initDb, closeDb, getDb } from '../src/db';

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

function insertPeer(db: ReturnType<typeof getDb>, overrides: Partial<{ id: string; name: string; url: string; api_key: string }> = {}) {
  const id = overrides.id || crypto.randomUUID();
  db.prepare('INSERT INTO peers (id, name, url, api_key) VALUES (?, ?, ?, ?)').run(
    id,
    overrides.name || 'Test Peer',
    overrides.url || 'http://localhost:9999',
    overrides.api_key || 'adb_testkey',
  );
  return id;
}

describe('Peers API', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    initDb(':memory:');
    request = supertest(createApp());
  });

  afterEach(() => {
    closeDb();
  });

  describe('GET /api/peers', () => {
    it('returns empty array initially', async () => {
      const res = await request.get('/api/peers');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns peers without exposing api_key', async () => {
      const db = getDb();
      insertPeer(db, { name: 'Secret Peer' });

      const res = await request.get('/api/peers');
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Secret Peer');
      expect(res.body[0]).not.toHaveProperty('api_key');
    });
  });

  describe('POST /api/peers', () => {
    it('rejects missing name', async () => {
      const res = await request.post('/api/peers').send({ url: 'http://x', api_key: 'k' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name');
    });

    it('rejects missing url', async () => {
      const res = await request.post('/api/peers').send({ name: 'N', api_key: 'k' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('url');
    });

    it('rejects missing api_key', async () => {
      const res = await request.post('/api/peers').send({ name: 'N', url: 'http://x' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('api_key');
    });

    it('rejects unreachable peer URL', async () => {
      const res = await request.post('/api/peers').send({
        name: 'Unreachable',
        url: 'http://192.0.2.1:1',
        api_key: 'adb_fake',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot reach');
    }, 15000);
  });

  describe('DELETE /api/peers/:id', () => {
    it('deletes an existing peer', async () => {
      const db = getDb();
      const id = insertPeer(db);

      const del = await request.delete(`/api/peers/${id}`);
      expect(del.status).toBe(204);

      const list = await request.get('/api/peers');
      expect(list.body).toHaveLength(0);
    });

    it('returns 404 for non-existent peer', async () => {
      const res = await request.delete('/api/peers/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/peers/:id/library', () => {
    it('returns 404 for non-existent peer', async () => {
      const res = await request.get('/api/peers/no-such-peer/library');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Peer not found');
    });
  });

  describe('POST /api/peers/:id/pull/:downloadId', () => {
    it('returns 404 for non-existent peer', async () => {
      const res = await request.post('/api/peers/no-peer/pull/some-dl');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Peer not found');
    });

    it('returns 409 if download already exists locally', async () => {
      const db = getDb();
      const peerId = insertPeer(db);

      const existingId = 'already-exists';
      db.prepare(
        `INSERT INTO downloads (id, url, title, category, status, progress)
         VALUES (?, ?, ?, ?, 'completed', 100)`
      ).run(existingId, 'https://youtube.com/watch?v=x', 'Exists', 'other');

      const res = await request.post(`/api/peers/${peerId}/pull/${existingId}`);
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Already exists');
    });
  });
});

describe('Peers API - self-federation integration', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    initDb(':memory:');
    request = supertest(createApp());
  });

  afterEach(() => {
    closeDb();
  });

  it('can add self as peer and browse own library', async () => {
    const keyRes = await request.post('/api/keys').send({ label: 'self-test' });
    expect(keyRes.status).toBe(201);
    const apiKey = keyRes.body.key;

    const db = getDb();
    db.prepare(
      `INSERT INTO downloads (id, url, title, category, status, progress)
       VALUES (?, ?, ?, ?, 'completed', 100)`
    ).run('shared-dl', 'https://youtube.com/watch?v=s', 'Shared Video', 'tv');

    const app = createApp();
    const server = app.listen(0);
    const addr = server.address() as any;
    const selfUrl = `http://127.0.0.1:${addr.port}`;

    const selfRequest = supertest(app);

    try {
      const addRes = await selfRequest.post('/api/peers').send({
        name: 'Myself',
        url: selfUrl,
        api_key: apiKey,
      });
      expect(addRes.status).toBe(201);
      const peerId = addRes.body.id;

      const libRes = await selfRequest.get(`/api/peers/${peerId}/library`);
      expect(libRes.status).toBe(200);
      expect(libRes.body.instanceName).toBe('TestInstance');
      expect(libRes.body.items).toHaveLength(1);
      expect(libRes.body.items[0].title).toBe('Shared Video');
    } finally {
      server.close();
    }
  });

  it('rejects adding self with wrong API key', async () => {
    const app = createApp();
    const server = app.listen(0);
    const addr = server.address() as any;
    const selfUrl = `http://127.0.0.1:${addr.port}`;
    const selfRequest = supertest(app);

    try {
      const res = await selfRequest.post('/api/peers').send({
        name: 'Bad Key',
        url: selfUrl,
        api_key: 'adb_wrong_key',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('401');
    } finally {
      server.close();
    }
  });
});
