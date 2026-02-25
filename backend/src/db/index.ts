import Database from 'better-sqlite3';

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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const columns = db.pragma('table_info(downloads)') as { name: string }[];
  if (!columns.some((c) => c.name === 'moved_to_library')) {
    db.exec('ALTER TABLE downloads ADD COLUMN moved_to_library INTEGER DEFAULT 0');
  }
  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
