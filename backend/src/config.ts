import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  outputFormat: process.env.OUTPUT_FORMAT || 'mkv',
  downloadPath: process.env.DOWNLOAD_PATH || path.join(process.cwd(), 'downloads'),
  mediaPath: process.env.MEDIA_PATH || path.join(process.cwd(), 'media'),
  dbPath: process.env.DB_PATH || path.join(process.cwd(), 'data', 'animedb.sqlite'),
  instanceName: process.env.INSTANCE_NAME || 'AnimeDB',
  externalUrl: process.env.EXTERNAL_URL || '',
  plex: {
    url: process.env.PLEX_URL || '',
    token: process.env.PLEX_TOKEN || '',
    sectionMovies: parseInt(process.env.PLEX_SECTION_MOVIES || '1', 10),
    sectionTv: parseInt(process.env.PLEX_SECTION_TV || '2', 10),
  },
};
