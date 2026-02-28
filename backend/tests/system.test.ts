import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import supertest from 'supertest';
import { createApp } from '../src/app';
import { initDb, closeDb } from '../src/db';

vi.mock('axios');

vi.mock('../src/services/queue', () => ({
  enqueue: vi.fn(),
}));

vi.mock('../src/services/plexClient', () => ({
  testPlexConnection: vi.fn().mockResolvedValue(false),
}));

vi.mock('../src/services/plexAuth', () => ({
  createPlexPin: vi.fn().mockResolvedValue({ authUrl: '', code: '', pinId: 1 }),
  pollPlexPin: vi.fn().mockResolvedValue({ token: null }),
  getPlexServers: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/config', () => ({
  config: {
    outputFormat: 'mkv',
    downloadPath: '/downloads',
    mediaPath: '/media',
    dbPath: ':memory:',
    port: 3000,
    authDisabled: true,
    buildSha: 'abc1234',
    githubRepo: 'test/AnimeDB',
    plex: { url: '', token: '', sectionMovies: 1, sectionTv: 2 },
  },
}));

describe('System API', () => {
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    vi.clearAllMocks();
    initDb(':memory:');
    request = supertest(createApp());
  });

  afterEach(() => {
    closeDb();
  });

  describe('GET /api/system/update-check', () => {
    it('returns current and remote SHA with update availability', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          sha: 'remote999',
          commit: {
            committer: { date: '2025-01-01T00:00:00Z' },
            message: 'feat: new stuff\n\nDetails',
          },
        },
      });

      const res = await request.get('/api/system/update-check');

      expect(res.status).toBe(200);
      expect(res.body.currentSha).toBe('abc1234');
      expect(res.body.remoteSha).toBe('remote999');
      expect(res.body.remoteMessage).toBe('feat: new stuff');
      expect(res.body.updateAvailable).toBe(true);
      expect(res.body.updateInProgress).toBe(false);
    });

    it('returns updateAvailable false when SHAs match', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          sha: 'abc1234',
          commit: {
            committer: { date: '' },
            message: 'same',
          },
        },
      });

      const res = await request.get('/api/system/update-check');

      expect(res.status).toBe(200);
      expect(res.body.updateAvailable).toBe(false);
    });

    it('returns 502 when GitHub fails', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('Network error'));

      const res = await request.get('/api/system/update-check');

      expect(res.status).toBe(502);
      expect(res.body.error).toContain('GitHub');
    });
  });

  describe('POST /api/system/update', () => {
    it('returns 200 and starts update', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('Network error'));

      const res = await request.post('/api/system/update');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('updating');
      expect(res.body.message).toContain('Download');
    });

    it('resets updateInProgress when async update fails', async () => {
      let callCount = 0;
      vi.mocked(axios.get).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Tarball fetch failed'));
        }
        return Promise.resolve({
          data: {
            sha: 'abc1234',
            commit: { committer: { date: '' }, message: '' },
          },
        });
      });

      const updateRes = await request.post('/api/system/update');
      expect(updateRes.status).toBe(200);

      await new Promise((r) => setTimeout(r, 300));

      const checkRes = await request.get('/api/system/update-check');
      expect(checkRes.status).toBe(200);
      expect(checkRes.body.updateInProgress).toBe(false);
    });

    it('returns 409 when update already in progress', async () => {
      vi.mocked(axios.get).mockImplementation(() => new Promise(() => {}));

      const [res1, res2] = await Promise.all([
        request.post('/api/system/update'),
        request.post('/api/system/update'),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(409);
      expect(res2.body.error).toContain('already in progress');
    });
  });
});
