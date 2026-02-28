import { getDb } from '../db';
import { config } from '../config';

export interface PlexSettings {
  url: string;
  token: string;
  sectionMovies: number;
  sectionTv: number;
}

const PLEX_KEYS = ['plex_url', 'plex_token', 'plex_section_movies', 'plex_section_tv'] as const;

let seeded = false;

function seedFromEnvIfNeeded(): void {
  if (seeded) return;
  seeded = true;

  const db = getDb();
  const existing = db.prepare(
    `SELECT key FROM settings WHERE key IN (${PLEX_KEYS.map(() => '?').join(', ')})`
  ).all(...PLEX_KEYS) as { key: string }[];

  if (existing.length > 0) return;

  if (!config.plex.url && !config.plex.token) return;

  const upsert = db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  );
  const seed = db.transaction(() => {
    upsert.run('plex_url', config.plex.url);
    upsert.run('plex_token', config.plex.token);
    upsert.run('plex_section_movies', String(config.plex.sectionMovies));
    upsert.run('plex_section_tv', String(config.plex.sectionTv));
  });
  seed();
}

export function getPlexSettings(): PlexSettings {
  seedFromEnvIfNeeded();

  const db = getDb();
  const rows = db.prepare(
    `SELECT key, value FROM settings WHERE key IN (${PLEX_KEYS.map(() => '?').join(', ')})`
  ).all(...PLEX_KEYS) as { key: string; value: string }[];

  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    url: map.get('plex_url') ?? config.plex.url,
    token: map.get('plex_token') ?? config.plex.token,
    sectionMovies: parseInt(map.get('plex_section_movies') ?? String(config.plex.sectionMovies), 10),
    sectionTv: parseInt(map.get('plex_section_tv') ?? String(config.plex.sectionTv), 10),
  };
}

export function savePlexSettings(data: Partial<PlexSettings>): PlexSettings {
  const current = getPlexSettings();

  const merged: PlexSettings = {
    url: data.url ?? current.url,
    token: data.token ?? current.token,
    sectionMovies: data.sectionMovies ?? current.sectionMovies,
    sectionTv: data.sectionTv ?? current.sectionTv,
  };

  const db = getDb();
  const upsert = db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  );
  const save = db.transaction(() => {
    upsert.run('plex_url', merged.url);
    upsert.run('plex_token', merged.token);
    upsert.run('plex_section_movies', String(merged.sectionMovies));
    upsert.run('plex_section_tv', String(merged.sectionTv));
  });
  save();

  return merged;
}
