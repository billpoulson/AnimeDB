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
    authDisabled: true,
    buildSha: 'test',
    githubRepo: 'test/test',
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

describe('POST /api/peers/connect', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    initDb(':memory:');
    request = supertest(createApp());
  });

  afterEach(() => {
    closeDb();
  });

  it('rejects missing connectionString', async () => {
    const res = await request.post('/api/peers/connect').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('connectionString is required');
  });

  it('rejects non-string connectionString', async () => {
    const res = await request.post('/api/peers/connect').send({ connectionString: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('connectionString is required');
  });

  it('rejects invalid base64', async () => {
    const res = await request.post('/api/peers/connect').send({ connectionString: 'adb-connect:not-valid-base64!!!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid connection string');
  });

  it('rejects connection string missing required fields', async () => {
    const payload = Buffer.from(JSON.stringify({ url: 'http://x' })).toString('base64');
    const res = await request.post('/api/peers/connect').send({ connectionString: `adb-connect:${payload}` });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('missing required fields');
  });

  it('rejects connection string with empty name', async () => {
    const payload = Buffer.from(JSON.stringify({ url: 'http://x', name: '', key: 'k' })).toString('base64');
    const res = await request.post('/api/peers/connect').send({ connectionString: `adb-connect:${payload}` });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('missing required fields');
  });

  it('rejects connection string with empty url', async () => {
    const payload = Buffer.from(JSON.stringify({ url: '', name: 'N', key: 'k' })).toString('base64');
    const res = await request.post('/api/peers/connect').send({ connectionString: `adb-connect:${payload}` });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('missing required fields');
  });

  it('rejects connection string with empty key', async () => {
    const payload = Buffer.from(JSON.stringify({ url: 'http://x', name: 'N', key: '' })).toString('base64');
    const res = await request.post('/api/peers/connect').send({ connectionString: `adb-connect:${payload}` });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('missing required fields');
  });

  it('rejects unreachable peer in connection string', async () => {
    const payload = Buffer.from(JSON.stringify({
      url: 'http://192.0.2.1:1',
      name: 'Unreachable',
      key: 'adb_fake',
    })).toString('base64');
    const res = await request.post('/api/peers/connect').send({ connectionString: `adb-connect:${payload}` });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot reach');
  }, 15000);

  it('works without adb-connect: prefix (raw base64)', async () => {
    const payload = Buffer.from(JSON.stringify({
      url: 'http://192.0.2.1:1',
      name: 'RawBase64',
      key: 'adb_fake',
    })).toString('base64');
    const res = await request.post('/api/peers/connect').send({ connectionString: payload });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot reach');
  }, 15000);
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

  it('can add self via connection string round-trip', async () => {
    const app = createApp();
    const server = app.listen(0);
    const addr = server.address() as any;
    const selfUrl = `http://127.0.0.1:${addr.port}`;
    const selfRequest = supertest(app);

    try {
      const payload = JSON.stringify({ url: selfUrl, name: 'SelfNode', key: '' });

      const keyRes = await selfRequest.post('/api/keys').send({ label: 'connect-test' });
      expect(keyRes.status).toBe(201);
      const apiKey = keyRes.body.key;

      const connStr = `adb-connect:${Buffer.from(JSON.stringify({ url: selfUrl, name: 'SelfNode', key: apiKey })).toString('base64')}`;

      const connectRes = await selfRequest.post('/api/peers/connect').send({ connectionString: connStr });
      expect(connectRes.status).toBe(201);
      expect(connectRes.body.name).toBe('SelfNode');
      expect(connectRes.body.url).toBe(selfUrl);
      expect(connectRes.body.instance_id).toBeTruthy();

      const peers = await selfRequest.get('/api/peers');
      expect(peers.body).toHaveLength(1);
      expect(peers.body[0].name).toBe('SelfNode');
    } finally {
      server.close();
    }
  });

  it('rejects connection string with wrong API key via self-connect', async () => {
    const app = createApp();
    const server = app.listen(0);
    const addr = server.address() as any;
    const selfUrl = `http://127.0.0.1:${addr.port}`;
    const selfRequest = supertest(app);

    try {
      const connStr = `adb-connect:${Buffer.from(JSON.stringify({ url: selfUrl, name: 'Bad', key: 'adb_wrong' })).toString('base64')}`;

      const res = await selfRequest.post('/api/peers/connect').send({ connectionString: connStr });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('401');
    } finally {
      server.close();
    }
  });

  it('strips trailing slashes from URL in connection string', async () => {
    const app = createApp();
    const server = app.listen(0);
    const addr = server.address() as any;
    const selfUrl = `http://127.0.0.1:${addr.port}`;
    const selfRequest = supertest(app);

    try {
      const keyRes = await selfRequest.post('/api/keys').send({ label: 'slash-test' });
      const apiKey = keyRes.body.key;

      const connStr = `adb-connect:${Buffer.from(JSON.stringify({ url: `${selfUrl}///`, name: 'SlashNode', key: apiKey })).toString('base64')}`;

      const connectRes = await selfRequest.post('/api/peers/connect').send({ connectionString: connStr });
      expect(connectRes.status).toBe(201);
      expect(connectRes.body.url).toBe(selfUrl);
    } finally {
      server.close();
    }
  });
});
