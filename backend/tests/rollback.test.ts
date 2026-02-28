import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  checkRollback,
  cleanupAfterSuccessfulUpdate,
  writeRollbackMarker,
  readMarker,
} from '../src/services/rollback';

describe('rollback', () => {
  let tmpDir: string;
  let markerPath: string;
  let backendDist: string;
  let frontendDist: string;
  let backendBak: string;
  let frontendBak: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedb-rollback-'));
    markerPath = path.join(tmpDir, 'ROLLBACK_MARKER');
    backendDist = path.join(tmpDir, 'dist');
    frontendDist = path.join(tmpDir, 'frontend-dist');
    backendBak = backendDist + '.bak';
    frontendBak = frontendDist + '.bak';
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('writeRollbackMarker', () => {
    it('writes a valid marker file with attempts=0', () => {
      writeRollbackMarker(markerPath, backendBak, frontendBak);

      const marker = readMarker(markerPath);
      expect(marker).not.toBeNull();
      expect(marker!.attempts).toBe(0);
      expect(marker!.backendBak).toBe(backendBak);
      expect(marker!.frontendBak).toBe(frontendBak);
      expect(marker!.timestamp).toBeGreaterThan(0);
    });
  });

  describe('readMarker', () => {
    it('returns null when no marker exists', () => {
      expect(readMarker(markerPath)).toBeNull();
    });

    it('parses an existing marker', () => {
      writeRollbackMarker(markerPath, '/a.bak', '/b.bak');
      const m = readMarker(markerPath);
      expect(m!.backendBak).toBe('/a.bak');
    });
  });

  describe('checkRollback', () => {
    it('returns "none" when no marker exists', () => {
      expect(checkRollback(markerPath)).toBe('none');
    });

    it('returns "first_boot" and bumps attempts on first startup after update', () => {
      writeRollbackMarker(markerPath, backendBak, frontendBak);

      const result = checkRollback(markerPath);
      expect(result).toBe('first_boot');

      const marker = readMarker(markerPath);
      expect(marker!.attempts).toBe(1);
    });

    it('returns "rolled_back" and restores .bak dirs on second startup', () => {
      fs.mkdirSync(backendBak, { recursive: true });
      fs.writeFileSync(path.join(backendBak, 'index.js'), 'old-backend');
      fs.mkdirSync(frontendBak, { recursive: true });
      fs.writeFileSync(path.join(frontendBak, 'index.html'), 'old-frontend');

      fs.mkdirSync(backendDist, { recursive: true });
      fs.writeFileSync(path.join(backendDist, 'index.js'), 'new-broken-backend');
      fs.mkdirSync(frontendDist, { recursive: true });
      fs.writeFileSync(path.join(frontendDist, 'index.html'), 'new-broken-frontend');

      writeRollbackMarker(markerPath, backendBak, frontendBak);
      // Simulate first boot bumping attempts
      const marker = readMarker(markerPath)!;
      marker.attempts = 1;
      fs.writeFileSync(markerPath, JSON.stringify(marker));

      const result = checkRollback(markerPath);
      expect(result).toBe('rolled_back');

      expect(fs.existsSync(markerPath)).toBe(false);
      expect(fs.existsSync(backendBak)).toBe(false);
      expect(fs.existsSync(frontendBak)).toBe(false);

      expect(fs.readFileSync(path.join(backendDist, 'index.js'), 'utf-8')).toBe('old-backend');
      expect(fs.readFileSync(path.join(frontendDist, 'index.html'), 'utf-8')).toBe('old-frontend');
    });

    it('handles rollback when only backend .bak exists (no frontend)', () => {
      fs.mkdirSync(backendBak, { recursive: true });
      fs.writeFileSync(path.join(backendBak, 'index.js'), 'old-backend');

      fs.mkdirSync(backendDist, { recursive: true });
      fs.writeFileSync(path.join(backendDist, 'index.js'), 'broken');

      writeRollbackMarker(markerPath, backendBak, frontendBak);
      const marker = readMarker(markerPath)!;
      marker.attempts = 1;
      fs.writeFileSync(markerPath, JSON.stringify(marker));

      const result = checkRollback(markerPath);
      expect(result).toBe('rolled_back');

      expect(fs.readFileSync(path.join(backendDist, 'index.js'), 'utf-8')).toBe('old-backend');
      expect(fs.existsSync(frontendDist)).toBe(false);
    });

    it('handles rollback when new dist does not exist yet', () => {
      fs.mkdirSync(backendBak, { recursive: true });
      fs.writeFileSync(path.join(backendBak, 'index.js'), 'old');

      writeRollbackMarker(markerPath, backendBak, frontendBak);
      const marker = readMarker(markerPath)!;
      marker.attempts = 1;
      fs.writeFileSync(markerPath, JSON.stringify(marker));

      const result = checkRollback(markerPath);
      expect(result).toBe('rolled_back');

      expect(fs.readFileSync(path.join(backendDist, 'index.js'), 'utf-8')).toBe('old');
    });

    it('cleans up marker on corrupt JSON', () => {
      fs.writeFileSync(markerPath, '{invalid json!!!');

      const result = checkRollback(markerPath);
      expect(result).toBe('none');
      expect(fs.existsSync(markerPath)).toBe(false);
    });

    it('handles missing attempts field as 0 (first boot)', () => {
      fs.writeFileSync(markerPath, JSON.stringify({
        timestamp: Date.now(),
        backendBak,
        frontendBak,
      }));

      const result = checkRollback(markerPath);
      expect(result).toBe('first_boot');
    });
  });

  describe('cleanupAfterSuccessfulUpdate', () => {
    it('returns false when no marker exists', () => {
      expect(cleanupAfterSuccessfulUpdate(markerPath)).toBe(false);
    });

    it('deletes .bak dirs and marker on successful update', () => {
      fs.mkdirSync(backendBak, { recursive: true });
      fs.writeFileSync(path.join(backendBak, 'index.js'), 'old');
      fs.mkdirSync(frontendBak, { recursive: true });
      fs.writeFileSync(path.join(frontendBak, 'index.html'), 'old');

      writeRollbackMarker(markerPath, backendBak, frontendBak);

      const result = cleanupAfterSuccessfulUpdate(markerPath);
      expect(result).toBe(true);

      expect(fs.existsSync(markerPath)).toBe(false);
      expect(fs.existsSync(backendBak)).toBe(false);
      expect(fs.existsSync(frontendBak)).toBe(false);
    });

    it('succeeds even if .bak dirs were already removed', () => {
      writeRollbackMarker(markerPath, backendBak, frontendBak);

      const result = cleanupAfterSuccessfulUpdate(markerPath);
      expect(result).toBe(true);
      expect(fs.existsSync(markerPath)).toBe(false);
    });

    it('handles corrupt marker gracefully', () => {
      fs.writeFileSync(markerPath, 'not json');

      const result = cleanupAfterSuccessfulUpdate(markerPath);
      expect(result).toBe(false);
      expect(fs.existsSync(markerPath)).toBe(false);
    });
  });

  describe('full lifecycle', () => {
    it('simulates successful update: write marker → first boot → listen → cleanup', () => {
      fs.mkdirSync(backendBak, { recursive: true });
      fs.writeFileSync(path.join(backendBak, 'old.js'), 'old');
      fs.mkdirSync(backendDist, { recursive: true });
      fs.writeFileSync(path.join(backendDist, 'new.js'), 'new');

      writeRollbackMarker(markerPath, backendBak, frontendBak);

      // First startup: bump attempts
      const boot1 = checkRollback(markerPath);
      expect(boot1).toBe('first_boot');
      expect(readMarker(markerPath)!.attempts).toBe(1);

      // App starts successfully, cleanup
      const cleaned = cleanupAfterSuccessfulUpdate(markerPath);
      expect(cleaned).toBe(true);
      expect(fs.existsSync(markerPath)).toBe(false);
      expect(fs.existsSync(backendBak)).toBe(false);
      expect(fs.readFileSync(path.join(backendDist, 'new.js'), 'utf-8')).toBe('new');
    });

    it('simulates failed update: write marker → first boot → crash → second boot → rollback', () => {
      // Setup: old code in .bak, new (broken) code in dist
      fs.mkdirSync(backendBak, { recursive: true });
      fs.writeFileSync(path.join(backendBak, 'app.js'), 'working-old');
      fs.mkdirSync(frontendBak, { recursive: true });
      fs.writeFileSync(path.join(frontendBak, 'app.html'), 'working-old-fe');

      fs.mkdirSync(backendDist, { recursive: true });
      fs.writeFileSync(path.join(backendDist, 'app.js'), 'broken-new');
      fs.mkdirSync(frontendDist, { recursive: true });
      fs.writeFileSync(path.join(frontendDist, 'app.html'), 'broken-new-fe');

      writeRollbackMarker(markerPath, backendBak, frontendBak);

      // First boot: bump attempts, return
      const boot1 = checkRollback(markerPath);
      expect(boot1).toBe('first_boot');

      // App crashes before listen... process restarts

      // Second boot: rollback
      const boot2 = checkRollback(markerPath);
      expect(boot2).toBe('rolled_back');

      // Old code is restored
      expect(fs.readFileSync(path.join(backendDist, 'app.js'), 'utf-8')).toBe('working-old');
      expect(fs.readFileSync(path.join(frontendDist, 'app.html'), 'utf-8')).toBe('working-old-fe');

      // Cleanup artifacts are gone
      expect(fs.existsSync(markerPath)).toBe(false);
      expect(fs.existsSync(backendBak)).toBe(false);
      expect(fs.existsSync(frontendBak)).toBe(false);
    });
  });
});
