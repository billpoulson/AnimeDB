import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { config } from '../config';

const execAsync = promisify(exec);
const router = Router();

let updateInProgress = false;

router.get('/update-check', async (_req: Request, res: Response) => {
  try {
    const { data } = await axios.get(
      `https://api.github.com/repos/${config.githubRepo}/commits/main`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
        timeout: 10000,
      },
    );

    const remoteSha: string = data.sha;
    const remoteDate: string = data.commit?.committer?.date || '';
    const remoteMessage: string = data.commit?.message?.split('\n')[0] || '';

    const updateAvailable =
      config.buildSha !== 'unknown' && remoteSha !== config.buildSha;

    res.json({
      currentSha: config.buildSha,
      remoteSha,
      remoteDate,
      remoteMessage,
      updateAvailable,
      updateInProgress,
    });
  } catch (err: any) {
    res.status(502).json({ error: `Failed to check GitHub: ${err.message}` });
  }
});

router.post('/update', async (_req: Request, res: Response) => {
  if (updateInProgress) {
    return res.status(409).json({ error: 'Update already in progress' });
  }

  updateInProgress = true;
  const tmpDir = `/tmp/animedb-update-${Date.now()}`;

  try {
    const tarballUrl = `https://api.github.com/repos/${config.githubRepo}/tarball/main`;

    res.json({ status: 'updating', message: 'Download and build started. The app will restart when complete.' });

    (async () => {
      try {
        const response = await axios.get(tarballUrl, {
          responseType: 'arraybuffer',
          timeout: 120000,
          headers: { Accept: 'application/vnd.github.v3+json' },
        });

        fs.mkdirSync(tmpDir, { recursive: true });
        const tarPath = path.join(tmpDir, 'source.tar.gz');
        fs.writeFileSync(tarPath, response.data);

        await execAsync(`tar xzf source.tar.gz --strip-components=1`, { cwd: tmpDir });

        const backendDir = path.join(tmpDir, 'backend');
        const frontendDir = path.join(tmpDir, 'frontend');

        console.log('Update: installing backend dependencies...');
        await execAsync('npm ci', { cwd: backendDir, timeout: 300000 });

        console.log('Update: compiling backend...');
        await execAsync('npx tsc', { cwd: backendDir, timeout: 120000 });

        console.log('Update: installing frontend dependencies...');
        await execAsync('npm ci', { cwd: frontendDir, timeout: 300000 });

        console.log('Update: building frontend...');
        await execAsync('npx vite build', { cwd: frontendDir, timeout: 120000 });

        const builtBackendDist = path.join(backendDir, 'dist');
        const builtFrontendDist = path.join(frontendDir, 'dist');

        if (!fs.existsSync(builtBackendDist) || !fs.existsSync(builtFrontendDist)) {
          throw new Error('Build artifacts not found');
        }

        const appBackendDist = path.resolve(__dirname, '..');
        const appFrontendDist = path.resolve(__dirname, '../../../frontend/dist');

        console.log('Update: replacing backend dist...');
        await execAsync(`rm -rf "${appBackendDist}" && cp -r "${builtBackendDist}" "${appBackendDist}"`);

        console.log('Update: replacing frontend dist...');
        await execAsync(`rm -rf "${appFrontendDist}" && cp -r "${builtFrontendDist}" "${appFrontendDist}"`);

        const latestShaRes = await axios.get(
          `https://api.github.com/repos/${config.githubRepo}/commits/main`,
          { headers: { Accept: 'application/vnd.github.v3+json' }, timeout: 10000 },
        );
        fs.writeFileSync(path.resolve(__dirname, '../../../BUILD_SHA'), latestShaRes.data.sha);

        console.log('Update: complete. Restarting...');
        fs.rmSync(tmpDir, { recursive: true, force: true });

        process.exit(0);
      } catch (err: any) {
        console.error('Update failed:', err.message);
        updateInProgress = false;
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }
    })();
  } catch (err: any) {
    updateInProgress = false;
    res.status(500).json({ error: err.message });
  }
});

export default router;
