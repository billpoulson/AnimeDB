import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { buildTargetPath, sanitizeFilename, moveToLibrary } from '../src/services/mediaOrganizer';
import { config } from '../src/config';

vi.mock('../src/config', () => ({
  config: {
    outputFormat: 'mkv',
    mediaPath: '/media',
    downloadPath: '/downloads',
  },
}));

describe('sanitizeFilename', () => {
  it('removes colons', () => {
    expect(sanitizeFilename('Title: Part 2')).toBe('Title Part 2');
  });

  it('removes angle brackets', () => {
    expect(sanitizeFilename('My <Video> Title')).toBe('My Video Title');
  });

  it('removes quotes and pipes', () => {
    expect(sanitizeFilename('He said "hello" | bye')).toBe('He said hello bye');
  });

  it('removes question marks and asterisks', () => {
    expect(sanitizeFilename('What? * Really!')).toBe('What Really!');
  });

  it('collapses multiple spaces', () => {
    expect(sanitizeFilename('too   many    spaces')).toBe('too many spaces');
  });

  it('trims whitespace', () => {
    expect(sanitizeFilename('  padded  ')).toBe('padded');
  });

  it('handles empty string', () => {
    expect(sanitizeFilename('')).toBe('');
  });
});

describe('buildTargetPath', () => {
  it('builds movie path', () => {
    const result = buildTargetPath({ title: 'My Movie', category: 'movies' });
    expect(result).toBe(
      path.join('/media', 'Movies', 'My Movie', 'My Movie.mkv')
    );
  });

  it('builds TV path with season and episode', () => {
    const result = buildTargetPath({
      title: 'My Show',
      category: 'tv',
      season: 2,
      episode: 5,
    });
    expect(result).toBe(
      path.join(
        '/media', 'Series', 'My Show',
        'Season 02', 'My Show - S02E05.mkv'
      )
    );
  });

  it('defaults to S01E01 for TV without season/episode', () => {
    const result = buildTargetPath({ title: 'Anime', category: 'tv' });
    expect(result).toBe(
      path.join(
        '/media', 'Series', 'Anime',
        'Season 01', 'Anime - S01E01.mkv'
      )
    );
  });

  it('builds other path into Movies', () => {
    const result = buildTargetPath({ title: 'Random', category: 'other' });
    expect(result).toBe(
      path.join('/media', 'Movies', 'Random', 'Random.mkv')
    );
  });

  it('sanitizes title in path', () => {
    const result = buildTargetPath({
      title: 'Bad: Title?',
      category: 'movies',
    });
    expect(result).toBe(
      path.join('/media', 'Movies', 'Bad Title', 'Bad Title.mkv')
    );
  });
});

describe('moveToLibrary', () => {
  const tmpDir = path.join(__dirname, '__tmp_movetest__');
  const sourceDir = path.join(tmpDir, 'source');
  const mediaDir = path.join(tmpDir, 'media');

  beforeEach(() => {
    (config as any).mediaPath = mediaDir;
    (config as any).downloadPath = sourceDir;
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'video.mkv'), 'test-content');
  });

  afterEach(() => {
    (config as any).mediaPath = '/media';
    (config as any).downloadPath = '/downloads';
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('moves file to correct location and deletes source', async () => {
    const sourcePath = path.join(sourceDir, 'video.mkv');
    const result = await moveToLibrary(sourcePath, {
      title: 'Test Video',
      category: 'movies',
    });

    expect(result).toBe(
      path.join(mediaDir, 'Movies', 'Test Video', 'Test Video.mkv')
    );
    expect(fs.existsSync(result)).toBe(true);
    expect(fs.existsSync(sourcePath)).toBe(false);
    expect(fs.readFileSync(result, 'utf-8')).toBe('test-content');
  });
});
