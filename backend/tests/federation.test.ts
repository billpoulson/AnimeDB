import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
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

function createTestKey(db: ReturnType<typeof getDb>): string {
  const rawKey = `adb_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  db.prepare('INSERT INTO api_keys (id, label, key_hash) VALUES (?, ?, ?)').run(
    crypto.randomUUID(), 'test-key', keyHash,
  );
  return rawKey;
}

function insertCompletedDownload(db: ReturnType<typeof getDb>, id: string, filePath?: string) {
  db.prepare(
    `INSERT INTO downloads (id, url, title, category, status, progress, file_path)
     VALUES (?, ?, ?, ?, 'completed', 100, ?)`
  ).run(id, 'https://youtube.com/watch?v=test', 'Test Video', 'movies', filePath || null);
}

describe('Federation API', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    initDb(':memory:');
    request = supertest(createApp());
  });

  afterEach(() => {
    closeDb();
  });

  describe('Authentication', () => {
    it('rejects requests without Authorization header', async () => {
      const res = await request.get('/api/federation/library');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authorization');
    });

    it('rejects requests with invalid key', async () => {
      const res = await request
        .get('/api/federation/library')
        .set('Authorization', 'Bearer invalid_key_here');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid API key');
    });

    it('rejects non-Bearer auth schemes', async () => {
      const res = await request
        .get('/api/federation/library')
        .set('Authorization', 'Basic dXNlcjpwYXNz');
      expect(res.status).toBe(401);
    });

    it('accepts valid API key', async () => {
      const db = getDb();
      const key = createTestKey(db);

      const res = await request
        .get('/api/federation/library')
        .set('Authorization', `Bearer ${key}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/federation/library', () => {
    it('returns instance name and empty items', async () => {
      const db = getDb();
      const key = createTestKey(db);

      const res = await request
        .get('/api/federation/library')
        .set('Authorization', `Bearer ${key}`);

      expect(res.status).toBe(200);
      expect(res.body.instanceName).toBe('TestInstance');
      expect(res.body.items).toEqual([]);
    });

    it('returns only completed downloads', async () => {
      const db = getDb();
      const key = createTestKey(db);

      insertCompletedDownload(db, 'dl-1');
      db.prepare(
        `INSERT INTO downloads (id, url, title, category, status, progress)
         VALUES (?, ?, ?, ?, 'queued', 0)`
      ).run('dl-2', 'https://youtube.com/watch?v=q', 'Queued One', 'tv');

      const res = await request
        .get('/api/federation/library')
        .set('Authorization', `Bearer ${key}`);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe('dl-1');
      expect(res.body.items[0].title).toBe('Test Video');
    });

    it('does not expose file_path or sensitive fields', async () => {
      const db = getDb();
      const key = createTestKey(db);
      insertCompletedDownload(db, 'dl-priv', '/secret/path.mkv');

      const res = await request
        .get('/api/federation/library')
        .set('Authorization', `Bearer ${key}`);

      expect(res.body.items[0]).not.toHaveProperty('file_path');
      expect(res.body.items[0]).not.toHaveProperty('url');
    });

    it('excludes federation-replicated downloads', async () => {
      const db = getDb();
      const key = createTestKey(db);

      insertCompletedDownload(db, 'dl-original');
      db.prepare(
        `INSERT INTO downloads (id, url, title, category, status, progress)
         VALUES (?, ?, ?, ?, 'completed', 100)`
      ).run('dl-replicated', 'federation://peer.example.com/remote-1', 'Replicated', 'movies');

      const res = await request
        .get('/api/federation/library')
        .set('Authorization', `Bearer ${key}`);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe('dl-original');
    });
  });

  describe('GET /api/federation/download/:id/stream', () => {
    it('returns 404 for non-existent download', async () => {
      const db = getDb();
      const key = createTestKey(db);

      const res = await request
        .get('/api/federation/download/no-such-id/stream')
        .set('Authorization', `Bearer ${key}`);
      expect(res.status).toBe(404);
    });

    it('streams an existing file', async () => {
      const db = getDb();
      const key = createTestKey(db);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-test-'));
      const tmpFile = path.join(tmpDir, 'test.mkv');
      fs.writeFileSync(tmpFile, 'fake video content');

      insertCompletedDownload(db, 'dl-stream', tmpFile);

      const res = await request
        .get('/api/federation/download/dl-stream/stream')
        .set('Authorization', `Bearer ${key}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('video/x-matroska');
      expect(res.headers['content-disposition']).toContain('test.mkv');
      expect(Buffer.from(res.body).toString()).toBe('fake video content');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('requires authentication', async () => {
      const res = await request.get('/api/federation/download/any/stream');
      expect(res.status).toBe(401);
    });
  });

  describe('Revoked key', () => {
    it('rejects access after key is deleted', async () => {
      const db = getDb();
      const key = createTestKey(db);

      const ok = await request
        .get('/api/federation/library')
        .set('Authorization', `Bearer ${key}`);
      expect(ok.status).toBe(200);

      db.prepare('DELETE FROM api_keys').run();

      const rejected = await request
        .get('/api/federation/library')
        .set('Authorization', `Bearer ${key}`);
      expect(rejected.status).toBe(401);
    });
  });
});
