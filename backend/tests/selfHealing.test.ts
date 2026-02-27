import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { initDb, closeDb, getDb, getInstanceId } from '../src/db';

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

function createTestKey(db: ReturnType<typeof getDb>): string {
  const rawKey = `adb_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  db.prepare('INSERT INTO api_keys (id, label, key_hash) VALUES (?, ?, ?)').run(
    crypto.randomUUID(), 'test-key', keyHash,
  );
  return rawKey;
}

describe('Instance ID', () => {
  beforeEach(() => { initDb(':memory:'); });
  afterEach(() => { closeDb(); });

  it('generates a UUID on first call', () => {
    const id = getInstanceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('returns the same ID on subsequent calls', () => {
    const id1 = getInstanceId();
    const id2 = getInstanceId();
    expect(id1).toBe(id2);
  });

  it('persists across DB reinit with same path', () => {
    const id1 = getInstanceId();
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'instance_id'").get() as any;
    expect(row.value).toBe(id1);
  });
});

describe('Federation announce endpoint', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    initDb(':memory:');
    request = supertest(createApp());
  });
  afterEach(() => { closeDb(); });

  it('returns instanceId in library response', async () => {
    const db = getDb();
    const key = createTestKey(db);

    const res = await request
      .get('/api/federation/library')
      .set('Authorization', `Bearer ${key}`);

    expect(res.status).toBe(200);
    expect(res.body.instanceId).toBeTruthy();
    expect(res.body.instanceId).toBe(getInstanceId());
  });

  it('updates peer URL on announce', async () => {
    const db = getDb();
    const key = createTestKey(db);
    const peerInstanceId = 'peer-uuid-123';

    db.prepare(
      'INSERT INTO peers (id, name, url, api_key, instance_id) VALUES (?, ?, ?, ?, ?)'
    ).run('p1', 'Remote', 'http://old-url:3000', 'somekey', peerInstanceId);

    const res = await request
      .post('/api/federation/announce')
      .set('Authorization', `Bearer ${key}`)
      .send({ instanceId: peerInstanceId, url: 'http://new-url:3000' });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);

    const peer = db.prepare('SELECT url, last_seen FROM peers WHERE id = ?').get('p1') as any;
    expect(peer.url).toBe('http://new-url:3000');
    expect(peer.last_seen).toBeTruthy();
  });

  it('strips trailing slashes from announced URL', async () => {
    const db = getDb();
    const key = createTestKey(db);

    db.prepare(
      'INSERT INTO peers (id, name, url, api_key, instance_id) VALUES (?, ?, ?, ?, ?)'
    ).run('p1', 'Remote', 'http://old:3000', 'k', 'inst-1');

    await request
      .post('/api/federation/announce')
      .set('Authorization', `Bearer ${key}`)
      .send({ instanceId: 'inst-1', url: 'http://new:3000///' });

    const peer = db.prepare('SELECT url FROM peers WHERE id = ?').get('p1') as any;
    expect(peer.url).toBe('http://new:3000');
  });

  it('returns updated=false for unknown instance ID', async () => {
    const db = getDb();
    const key = createTestKey(db);

    const res = await request
      .post('/api/federation/announce')
      .set('Authorization', `Bearer ${key}`)
      .send({ instanceId: 'unknown-id', url: 'http://x:3000' });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(false);
  });

  it('rejects announce without instanceId', async () => {
    const db = getDb();
    const key = createTestKey(db);

    const res = await request
      .post('/api/federation/announce')
      .set('Authorization', `Bearer ${key}`)
      .send({ url: 'http://x:3000' });

    expect(res.status).toBe(400);
  });

  it('rejects announce without url', async () => {
    const db = getDb();
    const key = createTestKey(db);

    const res = await request
      .post('/api/federation/announce')
      .set('Authorization', `Bearer ${key}`)
      .send({ instanceId: 'abc' });

    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request
      .post('/api/federation/announce')
      .send({ instanceId: 'x', url: 'http://x' });

    expect(res.status).toBe(401);
  });
});

describe('Federation resolve endpoint', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    initDb(':memory:');
    request = supertest(createApp());
  });
  afterEach(() => { closeDb(); });

  it('resolves a known peer by instance ID', async () => {
    const db = getDb();
    const key = createTestKey(db);

    db.prepare(
      "INSERT INTO peers (id, name, url, api_key, instance_id, last_seen) VALUES (?, ?, ?, ?, ?, datetime('now'))"
    ).run('p1', 'Alice', 'http://alice:3000', 'k', 'alice-uuid');

    const res = await request
      .get('/api/federation/resolve/alice-uuid')
      .set('Authorization', `Bearer ${key}`);

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('http://alice:3000');
    expect(res.body.name).toBe('Alice');
    expect(res.body.instanceId).toBe('alice-uuid');
  });

  it('returns 404 for unknown instance ID', async () => {
    const db = getDb();
    const key = createTestKey(db);

    const res = await request
      .get('/api/federation/resolve/unknown')
      .set('Authorization', `Bearer ${key}`);

    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const res = await request.get('/api/federation/resolve/some-id');
    expect(res.status).toBe(401);
  });
});

describe('Peer resolve (gossip)', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    initDb(':memory:');
    request = supertest(createApp());
  });
  afterEach(() => { closeDb(); });

  it('returns 404 for non-existent peer', async () => {
    const res = await request.post('/api/peers/no-peer/resolve');
    expect(res.status).toBe(404);
  });

  it('returns 400 if peer has no instance_id', async () => {
    const db = getDb();
    db.prepare(
      'INSERT INTO peers (id, name, url, api_key) VALUES (?, ?, ?, ?)'
    ).run('p1', 'Old Peer', 'http://x:3000', 'k');

    const res = await request.post('/api/peers/p1/resolve');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('instance ID');
  });

  it('returns 404 if no other peers to ask', async () => {
    const db = getDb();
    db.prepare(
      'INSERT INTO peers (id, name, url, api_key, instance_id) VALUES (?, ?, ?, ?, ?)'
    ).run('p1', 'Lonely', 'http://x:3000', 'k', 'lonely-uuid');

    const res = await request.post('/api/peers/p1/resolve');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('No other peers');
  });
});

describe('Peers store instance_id on add', () => {
  it('captures instance_id from probe during self-federation', async () => {
    initDb(':memory:');

    const app = createApp();
    const server = app.listen(0);
    const addr = server.address() as any;
    const selfUrl = `http://127.0.0.1:${addr.port}`;
    const selfRequest = supertest(app);

    try {
      const keyRes = await selfRequest.post('/api/keys').send({ label: 'self' });
      const apiKey = keyRes.body.key;

      const addRes = await selfRequest.post('/api/peers').send({
        name: 'Self',
        url: selfUrl,
        api_key: apiKey,
      });

      expect(addRes.status).toBe(201);
      expect(addRes.body.instance_id).toBeTruthy();
      expect(addRes.body.instance_id).toBe(getInstanceId());

      const db = getDb();
      const peer = db.prepare('SELECT instance_id, last_seen FROM peers WHERE id = ?').get(addRes.body.id) as any;
      expect(peer.instance_id).toBe(getInstanceId());
      expect(peer.last_seen).toBeTruthy();
    } finally {
      server.close();
      closeDb();
    }
  });
});

describe('Self-healing integration', () => {
  it('announce updates peer URL and resolve returns it', async () => {
    initDb(':memory:');

    const app = createApp();
    const server = app.listen(0);
    const addr = server.address() as any;
    const selfUrl = `http://127.0.0.1:${addr.port}`;
    const selfRequest = supertest(app);

    try {
      const keyRes = await selfRequest.post('/api/keys').send({ label: 'heal-test' });
      const apiKey = keyRes.body.key;

      const addRes = await selfRequest.post('/api/peers').send({
        name: 'Self',
        url: selfUrl,
        api_key: apiKey,
      });
      const peerId = addRes.body.id;
      const instanceId = addRes.body.instance_id;

      const announceRes = await selfRequest
        .post('/api/federation/announce')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ instanceId, url: 'http://new-address:4000' });

      expect(announceRes.body.updated).toBe(true);

      const resolveRes = await selfRequest
        .get(`/api/federation/resolve/${instanceId}`)
        .set('Authorization', `Bearer ${apiKey}`);

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.url).toBe('http://new-address:4000');
    } finally {
      server.close();
      closeDb();
    }
  });
});

describe('Networking exposes instance ID', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    initDb(':memory:');
    request = supertest(createApp());
  });
  afterEach(() => { closeDb(); });

  it('returns instanceId in networking response', async () => {
    const res = await request.get('/api/networking');

    expect(res.status).toBe(200);
    expect(res.body.instanceId).toBeTruthy();
    expect(res.body.instanceId).toBe(getInstanceId());
  });
});
