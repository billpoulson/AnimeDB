import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDb, closeDb, getDb } from '../src/db';
import { startPeerSync, stopPeerSync } from '../src/services/peerSync';

vi.mock('../src/services/replicate', () => ({
  runReplicateForPeer: vi.fn().mockResolvedValue({ queued: 0, skipped: 0, total: 0 }),
}));

vi.mock('../src/config', () => ({
  config: {
    peerSyncIntervalMinutes: 15,
  },
}));

import { runReplicateForPeer } from '../src/services/replicate';

function insertPeer(
  db: ReturnType<typeof getDb>,
  overrides: Partial<{ id: string; name: string; url: string; api_key: string; auto_replicate: number; sync_library_id: string | null }> = {},
) {
  const id = overrides.id || 'p-' + Math.random().toString(36).slice(2);
  db.prepare(
    'INSERT INTO peers (id, name, url, api_key, auto_replicate, sync_library_id) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    overrides.name ?? 'TestPeer',
    overrides.url ?? 'http://localhost:9999',
    overrides.api_key ?? 'adb_testkey',
    overrides.auto_replicate ?? 0,
    overrides.sync_library_id ?? null,
  );
  return id;
}

describe('peerSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initDb(':memory:');
  });

  afterEach(() => {
    stopPeerSync();
    closeDb();
  });

  describe('startPeerSync', () => {
    it('does nothing when no peers have auto_replicate', async () => {
      const db = getDb();
      insertPeer(db, { auto_replicate: 0 });

      startPeerSync();

      await vi.waitFor(() => {
        expect(runReplicateForPeer).not.toHaveBeenCalled();
      }, { timeout: 500 });
    });

    it('calls runReplicateForPeer for each peer with auto_replicate', async () => {
      const db = getDb();
      insertPeer(db, { id: 'p1', name: 'NodeA', auto_replicate: 1 });
      insertPeer(db, { id: 'p2', name: 'NodeB', auto_replicate: 1 });
      insertPeer(db, { id: 'p3', name: 'NodeC', auto_replicate: 0 });

      startPeerSync();

      await vi.waitFor(() => {
        expect(runReplicateForPeer).toHaveBeenCalledTimes(2);
      }, { timeout: 500 });

      expect(runReplicateForPeer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', name: 'NodeA' }),
        null,
      );
      expect(runReplicateForPeer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p2', name: 'NodeB' }),
        null,
      );
    });

    it('passes sync_library_id when peer has one', async () => {
      const db = getDb();
      db.prepare('INSERT INTO libraries (id, name, path, type) VALUES (?, ?, ?, ?)').run(
        'lib1',
        'Movies',
        '/media',
        'movies',
      );
      insertPeer(db, { id: 'p1', name: 'NodeA', auto_replicate: 1, sync_library_id: 'lib1' });

      startPeerSync();

      await vi.waitFor(() => {
        expect(runReplicateForPeer).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'p1' }),
          'lib1',
        );
      }, { timeout: 500 });
    });

    it('is idempotent - does not double-start', async () => {
      const db = getDb();
      insertPeer(db, { id: 'p1', auto_replicate: 1 });

      startPeerSync();
      startPeerSync();
      startPeerSync();

      await vi.waitFor(() => {
        expect(runReplicateForPeer).toHaveBeenCalled();
      }, { timeout: 500 });

      expect(runReplicateForPeer).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopPeerSync', () => {
    it('stops the interval', async () => {
      const db = getDb();
      insertPeer(db, { id: 'p1', auto_replicate: 1 });

      startPeerSync();
      await vi.waitFor(() => {
        expect(runReplicateForPeer).toHaveBeenCalledTimes(1);
      }, { timeout: 500 });

      stopPeerSync();
      vi.clearAllMocks();

      await new Promise((r) => setTimeout(r, 100));
      expect(runReplicateForPeer).not.toHaveBeenCalled();
    });
  });
});
