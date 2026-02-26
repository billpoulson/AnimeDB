import Database from 'better-sqlite3';
import path from 'path';

const [,, dbPath, localDownloads, localMedia] = process.argv;

if (!dbPath || !localDownloads || !localMedia) {
  console.error('Usage: tsx migrate-db.ts <db-path> <local-downloads-dir> <local-media-dir>');
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const downloads = db.prepare('SELECT id, file_path FROM downloads WHERE file_path IS NOT NULL').all() as {
  id: string;
  file_path: string;
}[];

const normDl = path.resolve(localDownloads).replace(/\\/g, '/');
const normMedia = path.resolve(localMedia).replace(/\\/g, '/');

let updated = 0;
const update = db.prepare('UPDATE downloads SET file_path = ? WHERE id = ?');

for (const row of downloads) {
  const normPath = row.file_path.replace(/\\/g, '/');

  let newPath: string | null = null;
  if (normPath.startsWith(normDl)) {
    newPath = '/downloads' + normPath.slice(normDl.length);
  } else if (normPath.startsWith(normMedia)) {
    newPath = '/media' + normPath.slice(normMedia.length);
  }

  if (newPath) {
    update.run(newPath, row.id);
    updated++;
    console.log(`  ${row.file_path} -> ${newPath}`);
  } else {
    console.log(`  SKIPPED (no match): ${row.file_path}`);
  }
}

db.close();
console.log(`\nDone. Updated ${updated} of ${downloads.length} file paths.`);
