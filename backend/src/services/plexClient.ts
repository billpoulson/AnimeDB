import axios from 'axios';
import { config } from '../config';
import { createLogger } from './logger';

const log = createLogger('plex');

export async function triggerPlexScan(category: string, plexSectionId?: number | null): Promise<void> {
  if (!config.plex.url || !config.plex.token) return;

  const sectionId = plexSectionId ??
    (category === 'movies' ? config.plex.sectionMovies :
     category === 'tv' ? config.plex.sectionTv :
     null);

  if (!sectionId) return;

  log.info(`Triggering Plex scan for section ${sectionId} (${category})`);
  await axios.get(
    `${config.plex.url}/library/sections/${sectionId}/refresh`,
    {
      headers: { 'X-Plex-Token': config.plex.token },
      timeout: 10000,
    }
  );
}

export async function testPlexConnection(): Promise<boolean> {
  if (!config.plex.url || !config.plex.token) return false;

  try {
    const res = await axios.get(`${config.plex.url}/identity`, {
      headers: { 'X-Plex-Token': config.plex.token },
      timeout: 5000,
    });
    log.info('Plex connection test succeeded');
    return res.status === 200;
  } catch (err: any) {
    log.warn(`Plex connection test failed: ${err.message}`);
    return false;
  }
}
