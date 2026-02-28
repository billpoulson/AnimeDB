import axios from 'axios';
import { getInstanceId } from '../db';
import { createLogger } from './logger';

const log = createLogger('plexAuth');

const PLEX_PRODUCT = 'AnimeDB';

function getPlexClientId(): string {
  return process.env.PLEX_CLIENT_ID || getInstanceId();
}

export interface PlexPinResult {
  authUrl: string;
  code: string;
  pinId: number;
}

export interface PlexPinPollResult {
  token: string | null;
  expiresAt?: string;
}

export interface PlexServer {
  name: string;
  uri: string;
}

export async function createPlexPin(): Promise<PlexPinResult> {
  const res = await axios.post(
    'https://plex.tv/api/v2/pins',
    new URLSearchParams({
      strong: 'true',
      'X-Plex-Product': PLEX_PRODUCT,
      'X-Plex-Client-Identifier': getPlexClientId(),
    }).toString(),
    {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 10000,
    }
  );

  const { id, code } = res.data;
  const authUrl = `https://app.plex.tv/auth#?clientID=${encodeURIComponent(getPlexClientId())}&code=${encodeURIComponent(code)}&context[device][product]=${encodeURIComponent(PLEX_PRODUCT)}`;

  log.info('Created Plex PIN', { pinId: id });
  return { authUrl, code, pinId: id };
}

export async function pollPlexPin(pinId: number, code: string): Promise<PlexPinPollResult> {
  const res = await axios.get(`https://plex.tv/api/v2/pins/${pinId}`, {
    headers: { 'Accept': 'application/json' },
    params: {
      code,
      'X-Plex-Client-Identifier': getPlexClientId(),
    },
    timeout: 10000,
  });

  const authToken = res.data.authToken ?? null;
  const expiresAt = res.data.expiresAt ?? undefined;

  if (authToken) {
    log.info('Plex PIN authorized', { pinId });
  }

  return { token: authToken, expiresAt };
}

export async function getPlexServers(token: string): Promise<PlexServer[]> {
  const res = await axios.get('https://plex.tv/resources', {
    headers: {
      'Accept': 'application/json',
      'X-Plex-Token': token,
    },
    params: { 'includeHttps': '1' },
    timeout: 10000,
  });

  const container = res.data?.MediaContainer;
  const devices = container?.Device ?? [];
  const servers: PlexServer[] = [];

  for (const device of devices) {
    if (device.provides !== 'server') continue;

    const connections = device.Connection ?? [];
    for (const conn of connections) {
      const uri = conn.uri ?? conn.URI;
      if (uri) {
        servers.push({ name: device.name ?? 'Plex Server', uri });
        break;
      }
    }
  }

  log.info('Discovered Plex servers', { count: servers.length });
  return servers;
}
