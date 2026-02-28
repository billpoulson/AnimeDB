/**
 * End-to-end automation tests that simulate real user workflows.
 * Each test suite spins up its own isolated app instance(s) with
 * in-memory DBs and temp directories — no mocks.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createApp } from '../src/app';
import { initDb, closeDb, getDb } from '../src/db';
import type { Server } from 'http';

vi.mock('../src/services/queue', () => ({ enqueue: vi.fn() }));
vi.mock('../src/services/plexClient', () => ({
  testPlexConnection: vi.fn().mockResolvedValue(false),
  triggerPlexScan: vi.fn().mockResolvedValue(undefined),
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
    instanceName: 'E2E-Node',
    externalUrl: '',
    authDisabled: true,
    buildSha: 'e2e-test-sha',
    githubRepo: 'test/test',
    plex: { url: '', token: '', sectionMovies: 1, sectionTv: 2 },
  },
}));

interface TestNode {
  app: ReturnType<typeof createApp>;
  server: Server;
  request: ReturnType<typeof supertest>;
  url: string;
  tmpDir: string;
}

async function createNode(name: string): Promise<TestNode> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `animedb-e2e-${name}-`));
  const { config } = await import('../src/config');
  config.downloadPath = path.join(tmpDir, 'downloads');
  config.mediaPath = path.join(tmpDir, 'media');
  config.instanceName = name;
  fs.mkdirSync(config.downloadPath, { recursive: true });
  fs.mkdirSync(config.mediaPath, { recursive: true });

  const app = createApp();
  const server = app.listen(0);
  const addr = server.address() as any;
  const url = `http://127.0.0.1:${addr.port}`;
  return { app, server, request: supertest(app), url, tmpDir };
}

function destroyNode(node: TestNode) {
  node.server.close();
  fs.rmSync(node.tmpDir, { recursive: true, force: true });
}

function waitForDownload(db: ReturnType<typeof getDb>, id: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const dl = db.prepare('SELECT status FROM downloads WHERE id = ?').get(id) as any;
      if (!dl) return reject(new Error('Download not found'));
      if (dl.status === 'completed' || dl.status === 'failed') return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('Timeout'));
      setTimeout(check, 50);
    };
    check();
  });
}

function waitForAllFederation(db: ReturnType<typeof getDb>, prefix: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const pending = db.prepare(
        "SELECT COUNT(*) as cnt FROM downloads WHERE url LIKE ? AND status IN ('queued','downloading')"
      ).get(`${prefix}%`) as any;
      if (pending.cnt === 0) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('Timeout'));
      setTimeout(check, 50);
    };
    check();
  });
}

// ---------------------------------------------------------------------------
// Scenario 1: Fresh user onboarding
// ---------------------------------------------------------------------------
describe('E2E: User onboarding', () => {
  let node: TestNode;

  beforeEach(() => { initDb(':memory:'); });
  afterEach(() => { destroyNode(node); closeDb(); });

  it('complete first-time setup: auth status → set password → login → use API', async () => {
    const { config } = await import('../src/config');
    config.authDisabled = false;
    node = await createNode('Onboard');

    const status1 = await node.request.get('/api/auth/status');
    expect(status1.body.setup).toBe(false);
    expect(status1.body.authenticated).toBe(false);
    expect(status1.body.authRequired).toBe(true);

    const setupRes = await node.request.post('/api/auth/setup').send({ password: 'hunter2' });
    expect(setupRes.status).toBe(200);
    const token = setupRes.body.token;
    expect(token).toBeTruthy();

    const status2 = await node.request.get('/api/auth/status').set('Authorization', `Bearer ${token}`);
    expect(status2.body.setup).toBe(true);
    expect(status2.body.authenticated).toBe(true);

    const noAuth = await node.request.get('/api/downloads');
    expect(noAuth.status).toBe(401);

    const withAuth = await node.request.get('/api/downloads').set('Authorization', `Bearer ${token}`);
    expect(withAuth.status).toBe(200);
    expect(withAuth.body).toEqual([]);

    const loginRes = await node.request.post('/api/auth/login').send({ password: 'hunter2' });
    expect(loginRes.status).toBe(200);
    const token2 = loginRes.body.token;

    const staleToken = await node.request.get('/api/downloads').set('Authorization', `Bearer ${token}`);
    expect(staleToken.status).toBe(401);

    const freshToken = await node.request.get('/api/downloads').set('Authorization', `Bearer ${token2}`);
    expect(freshToken.status).toBe(200);

    const changePw = await node.request.post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token2}`)
      .send({ currentPassword: 'hunter2', newPassword: 'newpass123' });
    expect(changePw.status).toBe(200);
    const token3 = changePw.body.token;

    const loginNew = await node.request.post('/api/auth/login').send({ password: 'newpass123' });
    expect(loginNew.status).toBe(200);

    const logoutRes = await node.request.post('/api/auth/logout').set('Authorization', `Bearer ${token3}`);
    expect(logoutRes.status).toBe(200);

    config.authDisabled = true;
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Library management & download → move → unmove lifecycle
// ---------------------------------------------------------------------------
describe('E2E: Library & download lifecycle', () => {
  let node: TestNode;

  beforeEach(() => { initDb(':memory:'); });
  afterEach(() => { destroyNode(node); closeDb(); });

  it('create libraries, queue downloads, move files to library, unmove back', async () => {
    node = await createNode('LibNode');

    const libRes = await node.request.post('/api/libraries').send({
      name: 'My Movies',
      path: path.join(node.tmpDir, 'media', 'movies'),
      type: 'movies',
    });
    expect(libRes.status).toBe(201);
    const movieLib = libRes.body;
    expect(movieLib.name).toBe('My Movies');
    expect(movieLib.type).toBe('movies');

    const tvLibRes = await node.request.post('/api/libraries').send({
      name: 'Anime Series',
      path: path.join(node.tmpDir, 'media', 'anime'),
      type: 'tv',
    });
    expect(tvLibRes.status).toBe(201);

    const listLibs = await node.request.get('/api/libraries');
    expect(listLibs.body).toHaveLength(2);

    const dlRes = await node.request.post('/api/downloads').send({
      url: 'https://youtube.com/watch?v=abc123',
      category: 'movies',
      title: 'My Awesome Movie',
    });
    expect(dlRes.status).toBe(201);
    const downloadId = dlRes.body.id;

    const db = getDb();
    const fakeFile = path.join(node.tmpDir, 'downloads', downloadId, 'movie.mkv');
    fs.mkdirSync(path.dirname(fakeFile), { recursive: true });
    fs.writeFileSync(fakeFile, 'fake-movie-content-bytes');
    db.prepare(
      "UPDATE downloads SET status = 'completed', progress = 100, file_path = ? WHERE id = ?"
    ).run(fakeFile, downloadId);

    const moveRes = await node.request.post(`/api/downloads/${downloadId}/move`)
      .send({ library_id: movieLib.id });
    expect(moveRes.status).toBe(200);
    expect(moveRes.body.moved_to_library).toBe(1);
    expect(moveRes.body.file_path).toContain('movies');
    expect(fs.existsSync(moveRes.body.file_path)).toBe(true);

    const doubleMove = await node.request.post(`/api/downloads/${downloadId}/move`)
      .send({ library_id: movieLib.id });
    expect(doubleMove.status).toBe(400);
    expect(doubleMove.body.error).toContain('Already moved');

    const unmoveRes = await node.request.post(`/api/downloads/${downloadId}/unmove`);
    expect(unmoveRes.status).toBe(200);
    expect(unmoveRes.body.moved_to_library).toBe(0);
    expect(fs.existsSync(unmoveRes.body.file_path)).toBe(true);

    const getAfter = await node.request.get(`/api/downloads/${downloadId}`);
    expect(getAfter.body.moved_to_library).toBe(0);
  });

  it('update download metadata (patch)', async () => {
    node = await createNode('PatchNode');

    const dlRes = await node.request.post('/api/downloads').send({
      url: 'https://youtube.com/watch?v=patch1',
      category: 'other',
      title: 'Original Title',
    });
    const id = dlRes.body.id;

    const patchRes = await node.request.patch(`/api/downloads/${id}`).send({
      category: 'tv',
      title: 'Updated Title',
      season: 2,
      episode: 5,
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.category).toBe('tv');
    expect(patchRes.body.title).toBe('Updated Title');
    expect(patchRes.body.season).toBe(2);
    expect(patchRes.body.episode).toBe(5);
  });

  it('cancel a queued download', async () => {
    node = await createNode('CancelNode');

    const dlRes = await node.request.post('/api/downloads').send({
      url: 'https://youtube.com/watch?v=cancel1',
      category: 'other',
    });
    const id = dlRes.body.id;

    const cancelRes = await node.request.post(`/api/downloads/${id}/cancel`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('cancelled');

    const get = await node.request.get(`/api/downloads/${id}`);
    expect(get.body.status).toBe('cancelled');
  });

  it('delete a download', async () => {
    node = await createNode('DeleteNode');

    const dlRes = await node.request.post('/api/downloads').send({
      url: 'https://youtube.com/watch?v=del1',
      category: 'movies',
    });

    const delRes = await node.request.delete(`/api/downloads/${dlRes.body.id}`);
    expect(delRes.status).toBe(204);

    const getRes = await node.request.get(`/api/downloads/${dlRes.body.id}`);
    expect(getRes.status).toBe(404);
  });

  it('stream a completed download', async () => {
    node = await createNode('StreamNode');

    const dlRes = await node.request.post('/api/downloads').send({
      url: 'https://youtube.com/watch?v=stream1',
      category: 'movies',
      title: 'StreamTest',
    });
    const id = dlRes.body.id;

    const db = getDb();
    const videoContent = 'fake-mkv-binary-stream-data';
    const fakeFile = path.join(node.tmpDir, 'downloads', id, 'stream.mkv');
    fs.mkdirSync(path.dirname(fakeFile), { recursive: true });
    fs.writeFileSync(fakeFile, videoContent);
    db.prepare(
      "UPDATE downloads SET status = 'completed', progress = 100, file_path = ? WHERE id = ?"
    ).run(fakeFile, id);

    const streamRes = await node.request.get(`/api/downloads/${id}/stream`);
    expect(streamRes.status).toBe(200);
    expect(streamRes.headers['content-type']).toBe('video/x-matroska');
    expect(Buffer.from(streamRes.body).toString()).toBe(videoContent);

    const rangeRes = await node.request.get(`/api/downloads/${id}/stream`)
      .set('Range', 'bytes=0-3');
    expect(rangeRes.status).toBe(206);
    expect(Buffer.from(rangeRes.body).toString()).toBe('fake');
  });

  it('library type auto-detection from name', async () => {
    node = await createNode('AutoDetectNode');

    const movie = await node.request.post('/api/libraries').send({
      name: 'My Film Collection', path: path.join(node.tmpDir, 'media', 'films'),
    });
    expect(movie.body.type).toBe('movies');

    const tv = await node.request.post('/api/libraries').send({
      name: 'Anime Series', path: path.join(node.tmpDir, 'media', 'anime'),
    });
    expect(tv.body.type).toBe('tv');

    const other = await node.request.post('/api/libraries').send({
      name: 'Random Stuff', path: path.join(node.tmpDir, 'media', 'random'),
    });
    expect(other.body.type).toBe('other');
  });

  it('update and delete a library', async () => {
    node = await createNode('LibCRUD');

    const lib = await node.request.post('/api/libraries').send({
      name: 'OldName', path: path.join(node.tmpDir, 'media', 'old'), type: 'other',
    });

    const patchRes = await node.request.patch(`/api/libraries/${lib.body.id}`).send({
      name: 'NewName', type: 'movies',
    });
    expect(patchRes.body.name).toBe('NewName');
    expect(patchRes.body.type).toBe('movies');

    const delRes = await node.request.delete(`/api/libraries/${lib.body.id}`);
    expect(delRes.status).toBe(204);

    const listRes = await node.request.get('/api/libraries');
    expect(listRes.body).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: API key management
// ---------------------------------------------------------------------------
describe('E2E: API key management', () => {
  let node: TestNode;

  beforeEach(() => { initDb(':memory:'); });
  afterEach(() => { destroyNode(node); closeDb(); });

  it('create, list, and revoke API keys', async () => {
    node = await createNode('KeyNode');

    const k1 = await node.request.post('/api/keys').send({ label: 'Peer Alpha' });
    expect(k1.status).toBe(201);
    expect(k1.body.key).toMatch(/^adb_/);
    expect(k1.body.label).toBe('Peer Alpha');

    const k2 = await node.request.post('/api/keys').send({ label: 'Peer Beta' });
    expect(k2.status).toBe(201);

    const listRes = await node.request.get('/api/keys');
    expect(listRes.body).toHaveLength(2);
    expect(listRes.body.every((k: any) => !k.key_hash)).toBe(true);

    const delRes = await node.request.delete(`/api/keys/${k1.body.id}`);
    expect(delRes.status).toBe(204);

    const listAfter = await node.request.get('/api/keys');
    expect(listAfter.body).toHaveLength(1);
    expect(listAfter.body[0].label).toBe('Peer Beta');
  });

  it('revoked key cannot access federation', async () => {
    node = await createNode('RevokeNode');

    const keyRes = await node.request.post('/api/keys').send({ label: 'Temp' });
    const apiKey = keyRes.body.key;

    const okRes = await node.request.get('/api/federation/library')
      .set('Authorization', `Bearer ${apiKey}`);
    expect(okRes.status).toBe(200);

    await node.request.delete(`/api/keys/${keyRes.body.id}`);

    const failRes = await node.request.get('/api/federation/library')
      .set('Authorization', `Bearer ${apiKey}`);
    expect(failRes.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Two-node federation: connect, browse, pull
// ---------------------------------------------------------------------------
describe('E2E: Two-node federation', () => {
  let nodeA: TestNode;

  beforeEach(() => { initDb(':memory:'); });
  afterEach(() => {
    destroyNode(nodeA);
    closeDb();
  });

  it('full peer lifecycle: add peer → browse library → pull file → verify', async () => {
    nodeA = await createNode('NodeA');

    const keyRes = await nodeA.request.post('/api/keys').send({ label: 'federation-key' });
    const apiKey = keyRes.body.key;

    const db = getDb();
    const srcFile = path.join(nodeA.tmpDir, 'source-video.mkv');
    fs.writeFileSync(srcFile, 'epic-anime-content-here');
    db.prepare(
      `INSERT INTO downloads (id, url, title, category, status, progress, file_path)
       VALUES (?, ?, ?, ?, 'completed', 100, ?)`
    ).run('shared-vid', 'https://youtube.com/watch?v=shared', 'Naruto Ep 1', 'tv', srcFile);

    const addPeer = await nodeA.request.post('/api/peers').send({
      name: 'SelfPeer', url: nodeA.url, api_key: apiKey,
    });
    expect(addPeer.status).toBe(201);
    const peerId = addPeer.body.id;
    expect(addPeer.body.instance_id).toBeTruthy();

    const libRes = await nodeA.request.get(`/api/peers/${peerId}/library`);
    expect(libRes.status).toBe(200);
    expect(libRes.body.instanceName).toBe('NodeA');
    expect(libRes.body.items).toHaveLength(1);
    expect(libRes.body.items[0].title).toBe('Naruto Ep 1');
    expect(libRes.body.items[0]).not.toHaveProperty('file_path');

    const pullRes = await nodeA.request.post(`/api/peers/${peerId}/pull/shared-vid`);
    expect(pullRes.status).toBe(202);
    const localId = pullRes.body.id;

    await waitForDownload(db, localId, 10000);

    const pulled = db.prepare('SELECT * FROM downloads WHERE id = ?').get(localId) as any;
    expect(pulled.status).toBe('completed');
    expect(pulled.progress).toBe(100);
    expect(pulled.title).toBe('Naruto Ep 1');
    expect(pulled.category).toBe('tv');
    expect(fs.existsSync(pulled.file_path)).toBe(true);
    expect(fs.readFileSync(pulled.file_path, 'utf-8')).toBe('epic-anime-content-here');
  }, 15000);

  it('pull with auto-move into a library', async () => {
    nodeA = await createNode('AutoMoveNode');

    const keyRes = await nodeA.request.post('/api/keys').send({ label: 'move-key' });
    const apiKey = keyRes.body.key;

    const libRes = await nodeA.request.post('/api/libraries').send({
      name: 'Anime', path: path.join(nodeA.tmpDir, 'media', 'anime'), type: 'tv',
    });
    const libraryId = libRes.body.id;

    const db = getDb();
    const srcFile = path.join(nodeA.tmpDir, 'ep1.mkv');
    fs.writeFileSync(srcFile, 'episode-data');
    db.prepare(
      `INSERT INTO downloads (id, url, title, category, season, episode, status, progress, file_path)
       VALUES (?, ?, ?, ?, 1, 1, 'completed', 100, ?)`
    ).run('ep-1', 'https://youtube.com/watch?v=ep1', 'My Show', 'tv', srcFile);

    const addPeer = await nodeA.request.post('/api/peers').send({
      name: 'Self', url: nodeA.url, api_key: apiKey,
    });
    const peerId = addPeer.body.id;

    const pullRes = await nodeA.request.post(`/api/peers/${peerId}/pull/ep-1`).send({
      autoMove: true, libraryId,
    });
    expect(pullRes.status).toBe(202);

    await waitForDownload(db, pullRes.body.id, 10000);

    const pulled = db.prepare('SELECT * FROM downloads WHERE id = ?').get(pullRes.body.id) as any;
    expect(pulled.status).toBe('completed');
    expect(pulled.moved_to_library).toBe(1);
    expect(pulled.library_id).toBe(libraryId);
    expect(pulled.file_path).toContain('anime');
    expect(fs.existsSync(pulled.file_path)).toBe(true);
  }, 15000);

  it('duplicate pull is rejected with 409', async () => {
    nodeA = await createNode('DupNode');

    const keyRes = await nodeA.request.post('/api/keys').send({ label: 'dup-key' });
    const apiKey = keyRes.body.key;

    const db = getDb();
    const srcFile = path.join(nodeA.tmpDir, 'dup.mkv');
    fs.writeFileSync(srcFile, 'data');
    db.prepare(
      `INSERT INTO downloads (id, url, title, category, status, progress, file_path)
       VALUES (?, ?, ?, ?, 'completed', 100, ?)`
    ).run('dup-vid', 'https://youtube.com/watch?v=dup', 'Dup Vid', 'movies', srcFile);

    const addPeer = await nodeA.request.post('/api/peers').send({
      name: 'Self', url: nodeA.url, api_key: apiKey,
    });
    const peerId = addPeer.body.id;

    const pull1 = await nodeA.request.post(`/api/peers/${peerId}/pull/dup-vid`);
    expect(pull1.status).toBe(202);

    await waitForDownload(db, pull1.body.id, 10000);

    const pull2 = await nodeA.request.post(`/api/peers/${peerId}/pull/dup-vid`);
    expect(pull2.status).toBe(409);
  }, 15000);

  it('connection string round-trip: generate → connect → browse', async () => {
    nodeA = await createNode('ConnStr');

    const keyRes = await nodeA.request.post('/api/keys').send({ label: 'conn-key' });
    const apiKey = keyRes.body.key;

    const db = getDb();
    db.prepare(
      `INSERT INTO downloads (id, url, title, category, status, progress)
       VALUES (?, ?, ?, ?, 'completed', 100)`
    ).run('conn-dl', 'https://youtube.com/watch?v=conn', 'ConnTest', 'other');

    const connStr = `adb-connect:${Buffer.from(JSON.stringify({
      url: nodeA.url, name: 'ConnPeer', key: apiKey,
    })).toString('base64')}`;

    const connectRes = await nodeA.request.post('/api/peers/connect').send({ connectionString: connStr });
    expect(connectRes.status).toBe(201);
    expect(connectRes.body.name).toBe('ConnPeer');
    expect(connectRes.body.instance_id).toBeTruthy();

    const lib = await nodeA.request.get(`/api/peers/${connectRes.body.id}/library`);
    expect(lib.body.items).toHaveLength(1);
    expect(lib.body.items[0].title).toBe('ConnTest');
  });

  it('peer delete cleans up', async () => {
    nodeA = await createNode('DelPeer');

    const keyRes = await nodeA.request.post('/api/keys').send({ label: 'del-key' });
    const addRes = await nodeA.request.post('/api/peers').send({
      name: 'TempPeer', url: nodeA.url, api_key: keyRes.body.key,
    });
    const peerId = addRes.body.id;

    const peers1 = await nodeA.request.get('/api/peers');
    expect(peers1.body).toHaveLength(1);

    const delRes = await nodeA.request.delete(`/api/peers/${peerId}`);
    expect(delRes.status).toBe(204);

    const peers2 = await nodeA.request.get('/api/peers');
    expect(peers2.body).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Full replicate library workflow
// ---------------------------------------------------------------------------
describe('E2E: Replicate library', () => {
  let node: TestNode;

  beforeEach(() => { initDb(':memory:'); });
  afterEach(() => { destroyNode(node); closeDb(); });

  it('replicate entire peer library in one click', async () => {
    node = await createNode('ReplicateSrc');

    const keyRes = await node.request.post('/api/keys').send({ label: 'rep-key' });
    const apiKey = keyRes.body.key;

    const db = getDb();
    for (let i = 1; i <= 3; i++) {
      const f = path.join(node.tmpDir, `vid${i}.mkv`);
      fs.writeFileSync(f, `content-for-video-${i}`);
      db.prepare(
        `INSERT INTO downloads (id, url, title, category, status, progress, file_path)
         VALUES (?, ?, ?, ?, 'completed', 100, ?)`
      ).run(`dl-${i}`, `https://youtube.com/watch?v=v${i}`, `Video ${i}`, 'movies', f);
    }

    const addPeer = await node.request.post('/api/peers').send({
      name: 'Source', url: node.url, api_key: apiKey,
    });
    const peerId = addPeer.body.id;

    const repRes = await node.request.post(`/api/peers/${peerId}/replicate`);
    expect(repRes.status).toBe(200);
    expect(repRes.body.total).toBe(3);
    expect(repRes.body.queued).toBe(3);
    expect(repRes.body.skipped).toBe(0);

    await waitForAllFederation(db, `federation://${node.url}/`, 15000);

    const replicated = db.prepare(
      "SELECT * FROM downloads WHERE url LIKE 'federation://%' AND status = 'completed'"
    ).all() as any[];
    expect(replicated).toHaveLength(3);
    for (const r of replicated) {
      expect(r.progress).toBe(100);
      expect(fs.existsSync(r.file_path)).toBe(true);
    }
  }, 20000);

  it('replicate with auto-move into library', async () => {
    node = await createNode('RepMove');

    const keyRes = await node.request.post('/api/keys').send({ label: 'rm-key' });
    const apiKey = keyRes.body.key;

    const libRes = await node.request.post('/api/libraries').send({
      name: 'Movies', path: path.join(node.tmpDir, 'media', 'movies'), type: 'movies',
    });
    const libraryId = libRes.body.id;

    const db = getDb();
    const f = path.join(node.tmpDir, 'film.mkv');
    fs.writeFileSync(f, 'movie-bytes');
    db.prepare(
      `INSERT INTO downloads (id, url, title, category, status, progress, file_path)
       VALUES (?, ?, ?, ?, 'completed', 100, ?)`
    ).run('film-1', 'https://youtube.com/watch?v=film', 'Great Film', 'movies', f);

    const addPeer = await node.request.post('/api/peers').send({
      name: 'Src', url: node.url, api_key: apiKey,
    });

    const repRes = await node.request.post(`/api/peers/${addPeer.body.id}/replicate`)
      .send({ libraryId });
    expect(repRes.body.queued).toBe(1);

    await waitForAllFederation(db, `federation://${node.url}/`, 15000);

    const rep = db.prepare(
      "SELECT * FROM downloads WHERE url LIKE 'federation://%' AND status = 'completed'"
    ).all() as any[];
    expect(rep).toHaveLength(1);
    expect(rep[0].moved_to_library).toBe(1);
    expect(rep[0].library_id).toBe(libraryId);
    expect(rep[0].file_path).toContain('movies');
    expect(fs.existsSync(rep[0].file_path)).toBe(true);
  }, 20000);

  it('replicate is idempotent — second call queues nothing', async () => {
    node = await createNode('RepIdem');

    const keyRes = await node.request.post('/api/keys').send({ label: 'idem-key' });
    const apiKey = keyRes.body.key;

    const db = getDb();
    const f = path.join(node.tmpDir, 'single.mkv');
    fs.writeFileSync(f, 'bytes');
    db.prepare(
      `INSERT INTO downloads (id, url, title, category, status, progress, file_path)
       VALUES (?, ?, ?, ?, 'completed', 100, ?)`
    ).run('single', 'https://youtube.com/watch?v=s', 'Single', 'other', f);

    const addPeer = await node.request.post('/api/peers').send({
      name: 'Src', url: node.url, api_key: apiKey,
    });
    const peerId = addPeer.body.id;

    const rep1 = await node.request.post(`/api/peers/${peerId}/replicate`);
    expect(rep1.body.queued).toBe(1);
    await waitForAllFederation(db, `federation://${node.url}/`, 15000);

    const rep2 = await node.request.post(`/api/peers/${peerId}/replicate`);
    expect(rep2.body.queued).toBe(0);
    expect(rep2.body.skipped).toBe(1);
  }, 20000);

  it('replicate skips items already pulled individually', async () => {
    node = await createNode('RepSkip');

    const keyRes = await node.request.post('/api/keys').send({ label: 'skip-key' });
    const apiKey = keyRes.body.key;

    const db = getDb();
    const f1 = path.join(node.tmpDir, 'a.mkv');
    const f2 = path.join(node.tmpDir, 'b.mkv');
    fs.writeFileSync(f1, 'aaa');
    fs.writeFileSync(f2, 'bbb');
    db.prepare(
      `INSERT INTO downloads (id, url, title, category, status, progress, file_path)
       VALUES (?, ?, ?, ?, 'completed', 100, ?)`
    ).run('r-a', 'https://youtube.com/watch?v=a', 'A', 'movies', f1);
    db.prepare(
      `INSERT INTO downloads (id, url, title, category, status, progress, file_path)
       VALUES (?, ?, ?, ?, 'completed', 100, ?)`
    ).run('r-b', 'https://youtube.com/watch?v=b', 'B', 'movies', f2);

    const addPeer = await node.request.post('/api/peers').send({
      name: 'Src', url: node.url, api_key: apiKey,
    });
    const peerId = addPeer.body.id;

    const pull = await node.request.post(`/api/peers/${peerId}/pull/r-a`);
    expect(pull.status).toBe(202);
    await waitForDownload(db, pull.body.id, 10000);

    const rep = await node.request.post(`/api/peers/${peerId}/replicate`);
    expect(rep.body.total).toBe(2);
    expect(rep.body.skipped).toBe(1);
    expect(rep.body.queued).toBe(1);
  }, 20000);
});

// ---------------------------------------------------------------------------
// Scenario 6: Federation announce & resolve
// ---------------------------------------------------------------------------
describe('E2E: Announce & resolve', () => {
  let node: TestNode;

  beforeEach(() => { initDb(':memory:'); });
  afterEach(() => { destroyNode(node); closeDb(); });

  it('announce updates peer URL, resolve finds it', async () => {
    node = await createNode('AnnounceNode');

    const keyRes = await node.request.post('/api/keys').send({ label: 'ann-key' });
    const apiKey = keyRes.body.key;

    const addRes = await node.request.post('/api/peers').send({
      name: 'Remote', url: node.url, api_key: apiKey,
    });
    const peerId = addRes.body.id;
    const instanceId = addRes.body.instance_id;
    expect(instanceId).toBeTruthy();

    const announceRes = await node.request.post('/api/federation/announce')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ instanceId, url: 'http://new-address:5000' });
    expect(announceRes.status).toBe(200);
    expect(announceRes.body.updated).toBe(true);

    const peers = await node.request.get('/api/peers');
    expect(peers.body[0].url).toBe('http://new-address:5000');
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Config & system endpoints
// ---------------------------------------------------------------------------
describe('E2E: Config & system', () => {
  let node: TestNode;

  beforeEach(() => { initDb(':memory:'); });
  afterEach(() => { destroyNode(node); closeDb(); });

  it('GET /api/config returns app configuration', async () => {
    node = await createNode('ConfigNode');

    const res = await node.request.get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.outputFormat).toBe('mkv');
    expect(res.body).toHaveProperty('plexConnected');
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: Full user journey — onboard, setup, populate, federate
// ---------------------------------------------------------------------------
describe('E2E: Complete user journey', () => {
  let node: TestNode;

  beforeEach(() => { initDb(':memory:'); });
  afterEach(() => { destroyNode(node); closeDb(); });

  it('simulates a user setting up their node end-to-end', async () => {
    node = await createNode('JourneyNode');
    const db = getDb();

    const configRes = await node.request.get('/api/config');
    expect(configRes.status).toBe(200);

    const moviesLib = await node.request.post('/api/libraries').send({
      name: 'Movies', path: path.join(node.tmpDir, 'media', 'movies'), type: 'movies',
    });
    const tvLib = await node.request.post('/api/libraries').send({
      name: 'TV Shows', path: path.join(node.tmpDir, 'media', 'tv'), type: 'tv',
    });

    const dl1 = await node.request.post('/api/downloads').send({
      url: 'https://youtube.com/watch?v=movie1', category: 'movies', title: 'Spirited Away',
    });
    const dl2 = await node.request.post('/api/downloads').send({
      url: 'https://youtube.com/watch?v=ep1', category: 'tv', title: 'Attack on Titan',
      season: 1, episode: 1,
    });
    const dl3 = await node.request.post('/api/downloads').send({
      url: 'https://youtube.com/watch?v=ep2', category: 'tv', title: 'Attack on Titan',
      season: 1, episode: 2,
    });

    for (const dl of [dl1, dl2, dl3]) {
      const f = path.join(node.tmpDir, 'downloads', dl.body.id, 'file.mkv');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, `content-${dl.body.id}`);
      db.prepare(
        "UPDATE downloads SET status = 'completed', progress = 100, file_path = ? WHERE id = ?"
      ).run(f, dl.body.id);
    }

    const listDl = await node.request.get('/api/downloads');
    expect(listDl.body).toHaveLength(3);
    expect(listDl.body.every((d: any) => d.status === 'completed')).toBe(true);

    await node.request.post(`/api/downloads/${dl1.body.id}/move`)
      .send({ library_id: moviesLib.body.id });
    await node.request.post(`/api/downloads/${dl2.body.id}/move`)
      .send({ library_id: tvLib.body.id });
    await node.request.post(`/api/downloads/${dl3.body.id}/move`)
      .send({ library_id: tvLib.body.id });

    const movedList = await node.request.get('/api/downloads');
    expect(movedList.body.every((d: any) => d.moved_to_library === 1)).toBe(true);

    const keyRes = await node.request.post('/api/keys').send({ label: 'Share Key' });
    const apiKey = keyRes.body.key;

    const fedLib = await node.request.get('/api/federation/library')
      .set('Authorization', `Bearer ${apiKey}`);
    expect(fedLib.body.items).toHaveLength(3);

    const addPeer = await node.request.post('/api/peers').send({
      name: 'MyNode', url: node.url, api_key: apiKey,
    });
    const peerId = addPeer.body.id;

    const peerLib = await node.request.get(`/api/peers/${peerId}/library`);
    expect(peerLib.body.items).toHaveLength(3);

    const repRes = await node.request.post(`/api/peers/${peerId}/replicate`);
    expect(repRes.body.total).toBe(3);
    expect(repRes.body.queued).toBe(3);

    await waitForAllFederation(db, `federation://${node.url}/`, 15000);

    const allDl = await node.request.get('/api/downloads');
    const fedDownloads = allDl.body.filter((d: any) => d.url?.startsWith('federation://'));
    expect(fedDownloads).toHaveLength(3);
    expect(fedDownloads.every((d: any) => d.status === 'completed')).toBe(true);

    const rep2 = await node.request.post(`/api/peers/${peerId}/replicate`);
    expect(rep2.body.queued).toBe(0);
    expect(rep2.body.skipped).toBe(3);
  }, 30000);
});
