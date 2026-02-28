import axios from 'axios';
import { getPlexSettings } from './settings';
import { createLogger } from './logger';

const log = createLogger('plex');

export async function triggerPlexScan(category: string, plexSectionId?: number | null): Promise<void> {
  const plex = getPlexSettings();
  if (!plex.url || !plex.token) return;

  const sectionId = plexSectionId ??
    (category === 'movies' ? plex.sectionMovies :
     category === 'tv' ? plex.sectionTv :
     null);

  if (!sectionId) return;

  log.info(`Triggering Plex scan for section ${sectionId} (${category})`);
  await axios.get(
    `${plex.url}/library/sections/${sectionId}/refresh`,
    {
      headers: { 'X-Plex-Token': plex.token },
      timeout: 10000,
    }
  );
}

export async function testPlexConnection(url?: string, token?: string): Promise<boolean> {
  const plex = getPlexSettings();
  const testUrl = url || plex.url;
  const testToken = token || plex.token;

  if (!testUrl || !testToken) return false;

  try {
    const res = await axios.get(`${testUrl}/identity`, {
      headers: { 'X-Plex-Token': testToken },
      timeout: 5000,
    });
    log.info('Plex connection test succeeded');
    return res.status === 200;
  } catch (err: any) {
    log.warn(`Plex connection test failed: ${err.message}`);
    return false;
  }
}
