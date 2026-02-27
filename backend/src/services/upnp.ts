import { config } from '../config';
// @ts-expect-error nat-upnp-2 has no type definitions
import natUpnp from 'nat-upnp-2';

const MAPPING_DESCRIPTION = 'AnimeDB';
const MAPPING_TTL = 0; // 0 = permanent until removed

interface UpnpState {
  active: boolean;
  externalIp: string | null;
  externalUrl: string | null;
  error: string | null;
}

let state: UpnpState = {
  active: false,
  externalIp: null,
  externalUrl: null,
  error: null,
};

let manualExternalUrl: string | null = config.externalUrl || null;
let client: any = null;

function promisifyClient(c: any) {
  return {
    portMapping(opts: any): Promise<void> {
      return new Promise((resolve, reject) => {
        c.portMapping(opts, (err: Error | null) => (err ? reject(err) : resolve()));
      });
    },
    portUnmapping(opts: any): Promise<void> {
      return new Promise((resolve, reject) => {
        c.portUnmapping(opts, (err: Error | null) => (err ? reject(err) : resolve()));
      });
    },
    externalIp(): Promise<string> {
      return new Promise((resolve, reject) => {
        c.externalIp((err: Error | null, ip: string) => (err ? reject(err) : resolve(ip)));
      });
    },
    close() {
      c.close();
    },
  };
}

export async function startUpnp(): Promise<void> {
  if (manualExternalUrl) {
    state = { active: false, externalIp: null, externalUrl: manualExternalUrl, error: null };
    console.log(`Using manual external URL: ${manualExternalUrl}`);
    return;
  }

  client = promisifyClient(natUpnp.createClient({ timeout: 10000 }));

  try {
    await client.portMapping({
      public: config.port,
      private: config.port,
      description: MAPPING_DESCRIPTION,
      ttl: MAPPING_TTL,
    });

    const ip = await client.externalIp();
    const url = `http://${ip}:${config.port}`;

    state = { active: true, externalIp: ip, externalUrl: url, error: null };
    console.log(`UPnP port mapping active: ${url}`);
  } catch (err: any) {
    state = {
      active: false,
      externalIp: null,
      externalUrl: null,
      error: err.message || 'UPnP discovery failed',
    };
    console.warn(`UPnP failed: ${state.error}. Set EXTERNAL_URL manually if you need federation.`);
  }
}

export async function stopUpnp(): Promise<void> {
  if (!client || !state.active) return;

  try {
    await client.portUnmapping({ public: config.port });
    console.log('UPnP port mapping removed');
  } catch {
    // best-effort cleanup
  } finally {
    client.close();
    client = null;
    state.active = false;
  }
}

export function getUpnpState(): UpnpState {
  return { ...state };
}

export function getExternalUrl(): string | null {
  return manualExternalUrl || state.externalUrl;
}

export function setManualExternalUrl(url: string | null): void {
  manualExternalUrl = url || null;
  if (manualExternalUrl) {
    state.externalUrl = manualExternalUrl;
  } else if (!state.active) {
    state.externalUrl = null;
  }
}
