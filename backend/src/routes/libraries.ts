import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db';
import { config } from '../config';

const router = Router();

const TYPE_PATTERNS: [RegExp, string][] = [
  [/movie/i, 'movies'],
  [/film/i, 'movies'],
  [/series/i, 'tv'],
  [/tv/i, 'tv'],
  [/show/i, 'tv'],
  [/anime/i, 'tv'],
  [/season/i, 'tv'],
];

function detectType(name: string): 'movies' | 'tv' | 'other' {
  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(name)) return type as 'movies' | 'tv' | 'other';
  }
  return 'other';
}

function resolveLibraryPath(libraryPath: string): string {
  if (path.isAbsolute(libraryPath)) return libraryPath;
  return path.join(config.mediaPath, libraryPath);
}

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const libraries = db.prepare('SELECT * FROM libraries ORDER BY name').all();
  res.json(libraries);
});

router.post('/', (req: Request, res: Response) => {
  const { name, path: libPath, type, plex_section_id } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!libPath || typeof libPath !== 'string') {
    return res.status(400).json({ error: 'path is required' });
  }

  const validTypes = ['movies', 'tv', 'other'];
  const resolvedType = type && validTypes.includes(type) ? type : detectType(name);

  const id = crypto.randomUUID();
  const db = getDb();

  const fullPath = resolveLibraryPath(libPath);
  fs.mkdirSync(fullPath, { recursive: true });

  db.prepare(
    'INSERT INTO libraries (id, name, path, type, plex_section_id) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name.trim(), libPath, resolvedType, plex_section_id ?? null);

  const library = db.prepare('SELECT * FROM libraries WHERE id = ?').get(id);
  res.status(201).json(library);
});

router.patch('/:id', (req: Request, res: Response) => {
  const { name, path: libPath, type, plex_section_id } = req.body;
  const db = getDb();

  const library = db.prepare('SELECT * FROM libraries WHERE id = ?').get(req.params.id);
  if (!library) {
    return res.status(404).json({ error: 'Not found' });
  }

  const validTypes = ['movies', 'tv', 'other'];
  if (type !== undefined && !validTypes.includes(type)) {
    return res.status(400).json({ error: 'type must be movies, tv, or other' });
  }

  const fields: string[] = [];
  const values: any[] = [];

  if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
  if (libPath !== undefined) {
    fields.push('path = ?');
    values.push(libPath);
    fs.mkdirSync(resolveLibraryPath(libPath), { recursive: true });
  }
  if (type !== undefined) { fields.push('type = ?'); values.push(type); }
  if (plex_section_id !== undefined) { fields.push('plex_section_id = ?'); values.push(plex_section_id); }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(req.params.id);
  db.prepare(`UPDATE libraries SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM libraries WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM libraries WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(204).send();
});

router.get('/scan', (_req: Request, res: Response) => {
  const mediaRoot = config.mediaPath;
  if (!fs.existsSync(mediaRoot)) {
    return res.json([]);
  }

  const db = getDb();
  const existing = (db.prepare('SELECT path FROM libraries').all() as { path: string }[])
    .map((l) => l.path);

  const entries = fs.readdirSync(mediaRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((e) => !existing.includes(e.name))
    .map((e) => ({
      name: e.name,
      path: e.name,
      suggested_type: detectType(e.name),
    }));

  res.json(entries);
});

export default router;
