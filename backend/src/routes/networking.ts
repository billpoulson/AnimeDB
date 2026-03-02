import { Router, Request, Response } from 'express';
import { config } from '../config';
import { getUpnpState, getExternalUrl, setManualExternalUrl, retryUpnp } from '../services/upnp';
import { getDb, getInstanceId } from '../db';
import { announceToAllPeers } from '../services/announce';

const router = Router();
const REMOTELY_MANAGED_KEY = 'external_url_remotely_managed';
const CONNECTABLE_KEY = 'external_url_connectable';

function getRemotelyManaged(): boolean {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(REMOTELY_MANAGED_KEY) as { value: string } | undefined;
  return row?.value === '1';
}

function setRemotelyManaged(value: boolean): void {
  const db = getDb();
  if (value) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(REMOTELY_MANAGED_KEY, '1');
  } else {
    db.prepare('DELETE FROM settings WHERE key = ?').run(REMOTELY_MANAGED_KEY);
  }
}

function getConnectable(): boolean {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(CONNECTABLE_KEY) as { value: string } | undefined;
  return row?.value === '1';
}

function setConnectable(value: boolean): void {
  const db = getDb();
  if (value) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(CONNECTABLE_KEY, '1');
  } else {
    db.prepare('DELETE FROM settings WHERE key = ?').run(CONNECTABLE_KEY);
  }
}

router.get('/', (_req: Request, res: Response) => {
  const upnp = getUpnpState();
  res.json({
    instanceId: getInstanceId(),
    instanceName: config.instanceName,
    externalUrl: getExternalUrl(),
    remotelyManaged: getRemotelyManaged(),
    connectable: getConnectable(),
    upnp: {
      active: upnp.active,
      externalIp: upnp.externalIp,
      externalPort: upnp.externalPort,
      error: upnp.error,
    },
  });
});

router.put('/external-url', (req: Request, res: Response) => {
  const { url, remotelyManaged } = req.body;

  if (url !== null && url !== undefined && typeof url !== 'string') {
    return res.status(400).json({ error: 'url must be a string or null' });
  }

  const cleanUrl = url ? url.replace(/\/+$/, '') : null;
  setManualExternalUrl(cleanUrl);
  setRemotelyManaged(remotelyManaged === true);

  if (cleanUrl) {
    announceToAllPeers().catch(() => {});
  }

  res.json({ externalUrl: getExternalUrl(), remotelyManaged: getRemotelyManaged() });
});

router.post('/upnp-retry', async (req: Request, res: Response) => {
  const { port } = req.body;

  if (port !== undefined && (typeof port !== 'number' || port < 1 || port > 65535 || !Number.isInteger(port))) {
    return res.status(400).json({ error: 'port must be an integer between 1 and 65535' });
  }

  const result = await retryUpnp(port || config.port);

  if (result.active) {
    announceToAllPeers().catch(() => {});
  }

  res.json({
    externalUrl: getExternalUrl(),
    upnp: {
      active: result.active,
      externalIp: result.externalIp,
      externalPort: result.externalPort,
      error: result.error,
    },
  });
});

router.put('/connectable', (req: Request, res: Response) => {
  const { connectable } = req.body;
  if (typeof connectable !== 'boolean') {
    return res.status(400).json({ error: 'connectable must be a boolean' });
  }
  setConnectable(connectable);
  res.json({ connectable: getConnectable() });
});

export default router;
