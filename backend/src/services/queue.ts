import { getDb } from '../db';
import { downloadVideo } from './downloader';

export interface DownloadRow {
  id: string;
  url: string;
  title: string | null;
  category: string;
  season: number | null;
  episode: number | null;
  status: string;
  progress: number;
  file_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

let currentJobId: string | null = null;
const MAX_RETRIES = 2;

export function enqueue(_id: string): void {
  scheduleNext();
}

export function startQueue(): void {
  const db = getDb();
  db.prepare(
    `UPDATE downloads SET status = 'queued' WHERE status IN ('downloading', 'processing')`
  ).run();
  currentJobId = null;
  scheduleNext();
}

export function resetQueue(): void {
  currentJobId = null;
}

function scheduleNext(): void {
  setImmediate(() => {
    if (currentJobId === null) {
      processNext().catch(console.error);
    }
  });
}

async function processNext(): Promise<void> {
  if (currentJobId !== null) return;

  const db = getDb();
  const job = db.prepare(
    `SELECT * FROM downloads WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`
  ).get() as DownloadRow | undefined;

  if (!job) return;

  currentJobId = job.id;
  try {
    await processJob(job);
  } finally {
    currentJobId = null;
    scheduleNext();
  }
}

async function processJob(job: DownloadRow, attempt = 1): Promise<void> {
  const db = getDb();

  try {
    db.prepare(
      `UPDATE downloads SET status = 'downloading', progress = 0, updated_at = datetime('now') WHERE id = ?`
    ).run(job.id);

    const result = await downloadVideo(job.url, (progress) => {
      db.prepare(
        `UPDATE downloads SET progress = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(progress.percent, job.id);
    }, job.id);

    const title = job.title || result.title || job.id;

    db.prepare(
      `UPDATE downloads SET status = 'completed', progress = 100, file_path = ?, title = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(result.filePath, title, job.id);
  } catch (err: any) {
    if (err.message === 'CANCELLED') {
      db.prepare(
        `UPDATE downloads SET status = 'cancelled', error = 'Cancelled by user', updated_at = datetime('now') WHERE id = ?`
      ).run(job.id);
      return;
    }
    if (attempt < MAX_RETRIES) {
      db.prepare(
        `UPDATE downloads SET status = 'queued', updated_at = datetime('now') WHERE id = ?`
      ).run(job.id);
      return processJob(job, attempt + 1);
    }
    db.prepare(
      `UPDATE downloads SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(err.message || 'Unknown error', job.id);
  }
}
