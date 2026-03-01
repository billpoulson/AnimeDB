import Database from 'better-sqlite3';
import crypto from 'crypto';

let db: Database.Database | null = null;

export function initDb(dbPath: string): Database.Database {
  if (db) {
    db.close();
  }
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT,
      category TEXT NOT NULL DEFAULT 'other',
      season INTEGER,
      episode INTEGER,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER DEFAULT 0,
      file_path TEXT,
      error TEXT,
      moved_to_library INTEGER DEFAULT 0,
      library_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS libraries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other',
      plex_section_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS peers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      instance_id TEXT,
      last_seen TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const peerCols = db.pragma('table_info(peers)') as { name: string }[];
  if (!peerCols.some((c) => c.name === 'instance_id')) {
    db.exec('ALTER TABLE peers ADD COLUMN instance_id TEXT');
  }
  if (!peerCols.some((c) => c.name === 'last_seen')) {
    db.exec('ALTER TABLE peers ADD COLUMN last_seen TEXT');
  }
  if (!peerCols.some((c) => c.name === 'auto_replicate')) {
    db.exec('ALTER TABLE peers ADD COLUMN auto_replicate INTEGER DEFAULT 0');
  }
  if (!peerCols.some((c) => c.name === 'sync_library_id')) {
    db.exec('ALTER TABLE peers ADD COLUMN sync_library_id TEXT');
  }

  const dlCols = db.pragma('table_info(downloads)') as { name: string }[];
  if (!dlCols.some((c) => c.name === 'moved_to_library')) {
    db.exec('ALTER TABLE downloads ADD COLUMN moved_to_library INTEGER DEFAULT 0');
  }
  if (!dlCols.some((c) => c.name === 'library_id')) {
    db.exec('ALTER TABLE downloads ADD COLUMN library_id TEXT');
  }
  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function getInstanceId(): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'instance_id'").get() as { value: string } | undefined;
  if (row) return row.value;

  const id = crypto.randomUUID();
  db.prepare("INSERT INTO settings (key, value) VALUES ('instance_id', ?)").run(id);
  return id;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
