import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initDb, closeDb, getDb } from '../src/db';

vi.mock('../src/services/downloader', () => ({
  downloadVideo: vi.fn(),
}));


vi.mock('../src/config', () => ({
  config: {
    outputFormat: 'mkv',
    downloadPath: '/downloads',
    mediaPath: '/media',
    dbPath: ':memory:',
    authDisabled: true,
    plex: { url: '', token: '', sectionMovies: 1, sectionTv: 2 },
  },
}));

import { startQueue, resetQueue } from '../src/services/queue';
import { downloadVideo } from '../src/services/downloader';

async function waitForStatus(id: string, status: string, timeoutMs = 5000): Promise<void> {
  const db = getDb();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = db.prepare('SELECT status FROM downloads WHERE id = ?').get(id) as any;
    if (row?.status === status) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  const row = db.prepare('SELECT status, error FROM downloads WHERE id = ?').get(id) as any;
  throw new Error(`Timeout: expected status "${status}" but got "${row?.status}" (error: ${row?.error})`);
}

describe('Queue', () => {
  beforeEach(() => {
    resetQueue();
    initDb(':memory:');
    vi.clearAllMocks();
  });

  afterEach(() => {
    closeDb();
  });

  it('processes a queued download to completion', async () => {
    const db = getDb();

    vi.mocked(downloadVideo).mockResolvedValue({ filePath: '/downloads/job-1/job-1.mkv', title: 'Test Video' });

    db.prepare(
      `INSERT INTO downloads (id, url, category, status) VALUES (?, ?, ?, ?)`
    ).run('job-1', 'https://youtube.com/watch?v=abc', 'movies', 'queued');

    startQueue();
    await waitForStatus('job-1', 'completed');

    const row = db.prepare('SELECT * FROM downloads WHERE id = ?').get('job-1') as any;
    expect(row.status).toBe('completed');
    expect(row.file_path).toBe('/downloads/job-1/job-1.mkv');
    expect(row.title).toBe('Test Video');
    expect(row.moved_to_library).toBe(0);
    expect(downloadVideo).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=abc',
      expect.any(Function),
      'job-1'
    );
  });

  it('marks download as failed after retries are exhausted', async () => {
    const db = getDb();

    vi.mocked(downloadVideo).mockRejectedValue(new Error('Network error'));

    db.prepare(
      `INSERT INTO downloads (id, url, category, status) VALUES (?, ?, ?, ?)`
    ).run('job-2', 'https://youtube.com/watch?v=fail', 'movies', 'queued');

    startQueue();
    await waitForStatus('job-2', 'failed');

    const row = db.prepare('SELECT * FROM downloads WHERE id = ?').get('job-2') as any;
    expect(row.status).toBe('failed');
    expect(row.error).toContain('Network error');
    expect(downloadVideo).toHaveBeenCalledTimes(2);
  });

  it('processes multiple jobs sequentially', async () => {
    const db = getDb();

    vi.mocked(downloadVideo).mockResolvedValue({ filePath: '/downloads/job/video.mkv', title: 'Video' });

    db.prepare(
      `INSERT INTO downloads (id, url, category, status, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run('job-a', 'https://youtube.com/watch?v=a', 'other', 'queued', '2025-01-01 00:00:00');

    db.prepare(
      `INSERT INTO downloads (id, url, category, status, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run('job-b', 'https://youtube.com/watch?v=b', 'other', 'queued', '2025-01-01 00:00:01');

    startQueue();
    await waitForStatus('job-a', 'completed');
    await waitForStatus('job-b', 'completed');

    expect(downloadVideo).toHaveBeenCalledTimes(2);
  });

  it('resets stuck jobs on startup', async () => {
    const db = getDb();

    vi.mocked(downloadVideo).mockResolvedValue({ filePath: '/downloads/stuck-1/video.mkv', title: 'Video' });

    db.prepare(
      `INSERT INTO downloads (id, url, category, status) VALUES (?, ?, ?, ?)`
    ).run('stuck-1', 'https://youtube.com/watch?v=stuck', 'other', 'downloading');

    startQueue();
    await waitForStatus('stuck-1', 'completed');

    expect(downloadVideo).toHaveBeenCalled();
  });
});
