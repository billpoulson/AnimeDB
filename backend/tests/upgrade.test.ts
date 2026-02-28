import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '../..');
const BACKEND_DIST = path.join(ROOT, 'backend', 'dist');

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function rmDir(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function waitForServer(port: number, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/config`);
      if (res.ok) return true;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return false;
}

describe('upgrade', () => {
  let tmpDir: string;
  let dataDir: string;
  let oldBackendDist: string;
  let port: number;
  let hasPreviousCommit = false;
  let stashed = false;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'animedb-upgrade-'));
    dataDir = path.join(tmpDir, 'data');
    oldBackendDist = path.join(tmpDir, 'old-backend-dist');
    fs.mkdirSync(dataDir, { recursive: true });
    port = 38500 + Math.floor(Math.random() * 500);

    try {
      execSync('git rev-parse HEAD~1', { cwd: ROOT, stdio: 'pipe' });
      hasPreviousCommit = true;
    } catch {
      hasPreviousCommit = false;
    }
  });

  afterAll(() => {
    rmDir(tmpDir);
    if (stashed) {
      try {
        execSync('git stash pop', { cwd: ROOT, stdio: 'pipe' });
      } catch {
        // ignore
      }
    }
  });

  it('validates upgrade from previous version to current version', async () => {
    if (!hasPreviousCommit) {
      console.warn('Skipping upgrade test: no previous commit');
      return;
    }

    if (!fs.existsSync(path.join(BACKEND_DIST, 'index.js'))) {
      throw new Error('Backend dist not found. Run "npm run build" first.');
    }

    const env = {
      ...process.env,
      PORT: String(port),
      DB_PATH: path.join(dataDir, 'animedb.sqlite'),
      DOWNLOAD_PATH: path.join(tmpDir, 'downloads'),
      MEDIA_PATH: path.join(tmpDir, 'media'),
      AUTH_DISABLED: 'true',
    };

    // 1. Stash uncommitted changes
    try {
      const status = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf-8' });
      if (status.trim()) {
        execSync('git stash push -u -m "animedb-upgrade-test"', { cwd: ROOT, stdio: 'pipe' });
        stashed = true;
      }
    } catch {
      // proceed without stash
    }

    // 2. Build previous backend only (frontend build can fail due to test/client mismatches across commits)
    execSync('git checkout HEAD~1 -- backend', { cwd: ROOT, stdio: 'pipe' });
    try {
      execSync('npm install', { cwd: path.join(ROOT, 'backend'), stdio: 'pipe' });
      execSync('npm run build', { cwd: path.join(ROOT, 'backend'), stdio: 'pipe' });
    } finally {
      execSync('git checkout HEAD -- backend', { cwd: ROOT, stdio: 'pipe' });
      if (stashed) {
        try {
          execSync('git stash pop', { cwd: ROOT, stdio: 'pipe' });
          stashed = false;
        } catch {
          // leave stashed for afterAll
        }
      }
    }

    // Copy previous backend build to temp (use current frontend for both runs)
    copyDir(path.join(ROOT, 'backend', 'dist'), oldBackendDist);;

    // 3. Restore current and rebuild
    execSync('git checkout HEAD -- backend', { cwd: ROOT, stdio: 'pipe' });
    if (stashed) {
      try {
        execSync('git stash pop', { cwd: ROOT, stdio: 'pipe' });
        stashed = false;
      } catch {}
    }
    execSync('npm install', { cwd: path.join(ROOT, 'backend'), stdio: 'pipe' });
    execSync('npm run build', { cwd: ROOT, stdio: 'pipe' });

    // 4. Run previous backend (frontend stays current)
    const backendDistOrig = path.join(ROOT, 'backend', 'dist');
    const backendDistBak = backendDistOrig + '.upgrade-test.bak';

    try {
      rmDir(backendDistBak);
      fs.renameSync(backendDistOrig, backendDistBak);
      copyDir(oldBackendDist, backendDistOrig);

      const proc = spawn(process.execPath, [path.join(backendDistOrig, 'index.js')], {
        cwd: ROOT,
        env,
        stdio: 'pipe',
      });

      const up = await waitForServer(port);
      expect(up).toBe(true);

      proc.kill('SIGTERM');
      await new Promise<void>((r) => proc.on('close', () => r()));

      // 5. "Upgrade": replace backend with current build
      rmDir(backendDistOrig);
      fs.renameSync(backendDistBak, backendDistOrig);

      // 6. Run current version (same DB)
      const proc2 = spawn(process.execPath, [path.join(backendDistOrig, 'index.js')], {
        cwd: ROOT,
        env,
        stdio: 'pipe',
      });

      const up2 = await waitForServer(port);
      expect(up2).toBe(true);

      const res = await fetch(`http://127.0.0.1:${port}/api/config`);
      expect(res.ok).toBe(true);
      const body = await res.json();
      expect(body).toHaveProperty('outputFormat');

      proc2.kill('SIGTERM');
      await new Promise<void>((r) => proc2.on('close', () => r()));
    } finally {
      if (fs.existsSync(backendDistBak)) {
        rmDir(backendDistOrig);
        fs.renameSync(backendDistBak, backendDistOrig);
      }
    }
  }, 120000);
});
