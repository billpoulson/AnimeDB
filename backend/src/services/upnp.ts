import { config } from '../config';
// @ts-expect-error nat-upnp-2 has no type definitions
import natUpnp from 'nat-upnp-2';
import { createLogger } from './logger';

const log = createLogger('UPnP');

const MAPPING_DESCRIPTION = 'AnimeDB';
const MAPPING_TTL = 3600; // 1 hour lease
const RENEWAL_INTERVAL = 20 * 60 * 1000; // renew every 20 minutes (well before expiry)

interface UpnpState {
  active: boolean;
  externalIp: string | null;
  externalUrl: string | null;
  externalPort: number | null;
  error: string | null;
}

let state: UpnpState = {
  active: false,
  externalIp: null,
  externalUrl: null,
  externalPort: null,
  error: null,
};

let manualExternalUrl: string | null = config.externalUrl || null;
let client: any = null;
let mappedPort: number | null = null;
let renewalTimer: ReturnType<typeof setInterval> | null = null;
let onRenewCallback: (() => void) | null = null;

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

function ensureClient() {
  if (!client) {
    client = promisifyClient(natUpnp.createClient({ timeout: 10000 }));
  }
  return client;
}

async function mapPort(publicPort: number): Promise<void> {
  const c = ensureClient();

  try {
    await c.portUnmapping({ public: publicPort });
  } catch {
    // ignore — no existing mapping to remove
  }

  if (mappedPort && mappedPort !== publicPort) {
    try {
      await c.portUnmapping({ public: mappedPort });
    } catch {
      // best-effort cleanup of previous alternate port
    }
  }

  await c.portMapping({
    public: publicPort,
    private: config.port,
    description: MAPPING_DESCRIPTION,
    ttl: MAPPING_TTL,
  });

  const ip = await c.externalIp();
  const url = `http://${ip}:${publicPort}`;

  mappedPort = publicPort;
  state = { active: true, externalIp: ip, externalUrl: url, externalPort: publicPort, error: null };
  log.info(`Port mapping active: ${url} (external ${publicPort} -> internal ${config.port}, TTL ${MAPPING_TTL}s)`);
}

async function renewMapping(): Promise<void> {
  if (!state.active || !mappedPort) return;

  const port = mappedPort;
  try {
    const c = ensureClient();
    await c.portMapping({
      public: port,
      private: config.port,
      description: MAPPING_DESCRIPTION,
      ttl: MAPPING_TTL,
    });
    const ip = await c.externalIp();
    const url = `http://${ip}:${port}`;

    const ipChanged = ip !== state.externalIp;
    state = { active: true, externalIp: ip, externalUrl: url, externalPort: port, error: null };

    if (ipChanged) {
      log.info(`Lease renewed, external IP changed: ${url}`);
    } else {
      log.info(`Lease renewed: ${url}`);
    }

    if (onRenewCallback) {
      try { onRenewCallback(); } catch { /* non-critical */ }
    }
  } catch (err: any) {
    log.warn(`Lease renewal failed: ${err.message}. Will retry in ${RENEWAL_INTERVAL / 60000} min.`);
  }
}

function startRenewalLoop(): void {
  stopRenewalLoop();
  renewalTimer = setInterval(() => {
    renewMapping().catch((err) => log.error(`Renewal loop error: ${err.message}`));
  }, RENEWAL_INTERVAL);
  // Don't prevent Node from exiting
  if (renewalTimer.unref) renewalTimer.unref();
}

function stopRenewalLoop(): void {
  if (renewalTimer) {
    clearInterval(renewalTimer);
    renewalTimer = null;
  }
}

export function onRenew(callback: () => void): void {
  onRenewCallback = callback;
}

export async function startUpnp(): Promise<void> {
  if (manualExternalUrl) {
    state = { active: false, externalIp: null, externalUrl: manualExternalUrl, externalPort: null, error: null };
    log.info(`Using manual external URL: ${manualExternalUrl}`);
    return;
  }

  try {
    await mapPort(config.port);
    startRenewalLoop();
  } catch (err: any) {
    state = {
      active: false,
      externalIp: null,
      externalUrl: null,
      externalPort: null,
      error: err.message || 'UPnP discovery failed',
    };
    log.warn(`Discovery failed: ${state.error}. Set EXTERNAL_URL manually if you need federation.`);
  }
}

export async function retryUpnp(publicPort: number): Promise<UpnpState> {
  try {
    await mapPort(publicPort);
    startRenewalLoop();
  } catch (err: any) {
    state = {
      active: false,
      externalIp: null,
      externalUrl: null,
      externalPort: null,
      error: err.message || 'UPnP mapping failed',
    };
    stopRenewalLoop();
    log.warn(`Retry on port ${publicPort} failed: ${state.error}`);
  }
  return getUpnpState();
}

export async function stopUpnp(): Promise<void> {
  stopRenewalLoop();

  if (!client || !state.active) return;

  const portToUnmap = mappedPort || config.port;
  try {
    await client.portUnmapping({ public: portToUnmap });
    log.info('Port mapping removed');
  } catch {
    // best-effort cleanup
  } finally {
    client.close();
    client = null;
    mappedPort = null;
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
    stopRenewalLoop();
    state.externalUrl = manualExternalUrl;
  } else if (!state.active) {
    state.externalUrl = null;
  }
}

export { MAPPING_TTL, RENEWAL_INTERVAL };
