import { ChildProcess, spawn, execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

export interface DownloadProgress {
  percent: number;
  speed?: string;
  eta?: string;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

const activeProcesses = new Map<string, ChildProcess>();
const cancelledIds = new Set<string>();

export function parseProgress(line: string): DownloadProgress | null {
  const match = line.match(/\[download\]\s+(\d+\.?\d*)%/);
  if (!match) return null;

  const percent = Math.round(parseFloat(match[1]));
  const speedMatch = line.match(/at\s+(\S+\/s)/);
  const etaMatch = line.match(/ETA\s+(\S+)/);

  return {
    percent,
    speed: speedMatch?.[1],
    eta: etaMatch?.[1],
  };
}

function killProcessTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch {
    // process may already be dead
  }
}

export function cancelDownload(jobId: string): boolean {
  cancelledIds.add(jobId);
  const proc = activeProcesses.get(jobId);
  if (proc && proc.pid) {
    killProcessTree(proc.pid);
    activeProcesses.delete(jobId);
    return true;
  }
  return false;
}

function readTitleFromInfoJson(dir: string): string {
  try {
    const jsonFile = fs.readdirSync(dir).find(f => f.endsWith('.info.json'));
    if (jsonFile) {
      const info = JSON.parse(fs.readFileSync(path.join(dir, jsonFile), 'utf-8'));
      if (info.title) return info.title;
    }
  } catch { /* fall through */ }
  return '';
}

function resolveOutputFile(dir: string, ext: string): string {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => path.extname(f).toLowerCase() === ext.toLowerCase())
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length > 0) {
      return path.join(dir, files[0].name);
    }
  } catch {
    // fall through
  }
  throw new Error('Download completed but could not locate output file');
}

export interface DownloadResult {
  filePath: string;
  title: string;
}

export async function downloadVideo(
  url: string,
  onProgress?: ProgressCallback,
  jobId?: string
): Promise<DownloadResult> {
  return new Promise((resolve, reject) => {
    const id = jobId || crypto.randomUUID();
    const jobDir = path.join(config.downloadPath, id);
    fs.mkdirSync(jobDir, { recursive: true });
    const outputTemplate = path.join(jobDir, `${id}.%(ext)s`);

    const args = [
      '-f', 'bestvideo+bestaudio/best',
      '--merge-output-format', config.outputFormat,
      '-o', outputTemplate,
      '--write-info-json',
      '--newline',
      '--no-colors',
      '--js-runtimes', 'node',
      url,
    ];

    const proc = spawn('yt-dlp', args);
    if (jobId) activeProcesses.set(jobId, proc);

    let mergedFile = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const progress = parseProgress(line);
        if (progress && onProgress) {
          onProgress(progress);
        }

        const mergerMatch = line.match(/\[Merger\] Merging formats into "(.+)"/);
        const alreadyMatch = line.match(/\[download\] (.+) has already been downloaded/);

        if (mergerMatch) mergedFile = mergerMatch[1];
        else if (alreadyMatch) mergedFile = alreadyMatch[1];
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (jobId) activeProcesses.delete(jobId);

      if (jobId && cancelledIds.has(jobId)) {
        cancelledIds.delete(jobId);
        reject(new Error('CANCELLED'));
      } else if (code === 0) {
        try {
          let filePath = mergedFile && fs.existsSync(mergedFile)
            ? mergedFile
            : resolveOutputFile(jobDir, `.${config.outputFormat}`);
          const title = readTitleFromInfoJson(jobDir);
          resolve({ filePath, title });
        } catch (e) {
          reject(e);
        }
      } else {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      if (jobId) activeProcesses.delete(jobId);
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}
