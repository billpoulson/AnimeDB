import path from 'path';
import fs from 'fs';
import { createLogger } from './logger';

const log = createLogger('rollback');

export const APP_ROOT = path.resolve(__dirname, '../..');
export const ROLLBACK_MARKER = path.join(APP_ROOT, 'ROLLBACK_MARKER');

export interface RollbackMarker {
  timestamp: number;
  attempts: number;
  backendBak: string;
  frontendBak: string;
}

export function readMarker(markerPath: string): RollbackMarker | null {
  if (!fs.existsSync(markerPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Called at startup before the app initialises.
 * - First boot after update (attempts === 0): bumps attempts to 1, returns 'first_boot'.
 * - Second boot (attempts >= 1): restores .bak dirs, deletes marker, returns 'rolled_back'.
 * - No marker: returns 'none'.
 */
export function checkRollback(markerPath: string = ROLLBACK_MARKER): 'none' | 'first_boot' | 'rolled_back' {
  if (!fs.existsSync(markerPath)) return 'none';
  const marker = readMarker(markerPath);
  if (!marker) {
    log.warn('Corrupt rollback marker — removing');
    try { fs.unlinkSync(markerPath); } catch {}
    return 'none';
  }

  try {
    if ((marker.attempts ?? 0) === 0) {
      marker.attempts = 1;
      fs.writeFileSync(markerPath, JSON.stringify(marker));
      log.info('Post-update startup — will rollback if this boot fails');
      return 'first_boot';
    }

    log.warn('Rollback marker detected from a failed update — restoring previous version');

    if (marker.backendBak && fs.existsSync(marker.backendBak)) {
      const backendDist = marker.backendBak.replace(/\.bak$/, '');
      if (fs.existsSync(backendDist)) fs.rmSync(backendDist, { recursive: true, force: true });
      fs.renameSync(marker.backendBak, backendDist);
    }
    if (marker.frontendBak && fs.existsSync(marker.frontendBak)) {
      const frontendDist = marker.frontendBak.replace(/\.bak$/, '');
      if (fs.existsSync(frontendDist)) fs.rmSync(frontendDist, { recursive: true, force: true });
      fs.renameSync(marker.frontendBak, frontendDist);
    }

    fs.unlinkSync(markerPath);
    log.warn('Rollback complete — restarting with previous version');
    return 'rolled_back';
  } catch (err: any) {
    log.error(`Rollback failed: ${err.message}`);
    try { fs.unlinkSync(markerPath); } catch {}
    return 'none';
  }
}

/**
 * Called after app.listen succeeds. Deletes .bak dirs and marker.
 */
export function cleanupAfterSuccessfulUpdate(markerPath: string = ROLLBACK_MARKER): boolean {
  if (!fs.existsSync(markerPath)) return false;
  const marker = readMarker(markerPath);
  if (!marker) {
    try { fs.unlinkSync(markerPath); } catch {}
    return false;
  }

  try {
    if (marker.backendBak && fs.existsSync(marker.backendBak)) {
      fs.rmSync(marker.backendBak, { recursive: true, force: true });
    }
    if (marker.frontendBak && fs.existsSync(marker.frontendBak)) {
      fs.rmSync(marker.frontendBak, { recursive: true, force: true });
    }

    fs.unlinkSync(markerPath);
    log.info('Update verified — old backup cleaned up');
    return true;
  } catch (err: any) {
    log.warn(`Backup cleanup failed (non-critical): ${err.message}`);
    try { fs.unlinkSync(markerPath); } catch {}
    return false;
  }
}

export function writeRollbackMarker(
  markerPath: string,
  backendBak: string,
  frontendBak: string,
): void {
  const marker = JSON.stringify({
    timestamp: Date.now(),
    attempts: 0,
    backendBak,
    frontendBak,
  });
  fs.writeFileSync(markerPath, marker);
}
