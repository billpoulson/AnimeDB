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

export function resolveLibraryPath(libraryPath: string): string {
  if (path.isAbsolute(libraryPath)) return libraryPath;
  return path.join(config.mediaPath, libraryPath);
}

export function buildTargetPath(info: MediaInfo, libraryBasePath?: string): string {
  const ext = `.${config.outputFormat}`;
  const safeTitle = sanitizeFilename(info.title);

  if (libraryBasePath) {
    const base = resolveLibraryPath(libraryBasePath);
    switch (info.category) {
      case 'tv': {
        const s = String(info.season || 1).padStart(2, '0');
        const e = String(info.episode || 1).padStart(2, '0');
        return path.join(base, safeTitle, `Season ${s}`, `${safeTitle} - S${s}E${e}${ext}`);
      }
      default:
        return path.join(base, safeTitle, `${safeTitle}${ext}`);
    }
  }

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

export async function moveToLibrary(sourcePath: string, info: MediaInfo, libraryBasePath?: string): Promise<string> {
  const targetPath = buildTargetPath(info, libraryBasePath);
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
