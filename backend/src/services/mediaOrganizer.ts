import fs from 'fs';
import path from 'path';
import { config } from '../config';

export interface MediaInfo {
  title: string;
  category: 'movies' | 'tv' | 'other';
  season?: number;
  episode?: number;
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildTargetPath(info: MediaInfo): string {
  const ext = `.${config.outputFormat}`;
  const safeTitle = sanitizeFilename(info.title);

  switch (info.category) {
    case 'movies':
      return path.join(config.mediaPath, 'Movies', safeTitle, `${safeTitle}${ext}`);
    case 'tv': {
      const s = String(info.season || 1).padStart(2, '0');
      const e = String(info.episode || 1).padStart(2, '0');
      return path.join(
        config.mediaPath, 'Series', safeTitle,
        `Season ${s}`, `${safeTitle} - S${s}E${e}${ext}`
      );
    }
    default:
      return path.join(config.mediaPath, 'Movies', safeTitle, `${safeTitle}${ext}`);
  }
}

export async function moveToLibrary(sourcePath: string, info: MediaInfo): Promise<string> {
  const targetPath = buildTargetPath(info);
  const targetDir = path.dirname(targetPath);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  fs.unlinkSync(sourcePath);

  const sourceDir = path.dirname(sourcePath);
  try {
    const remaining = fs.readdirSync(sourceDir);
    if (remaining.length === 0) fs.rmdirSync(sourceDir);
  } catch { /* non-critical cleanup */ }

  return targetPath;
}
