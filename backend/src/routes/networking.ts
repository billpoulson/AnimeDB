import { Router, Request, Response } from 'express';
import { config } from '../config';
import { getUpnpState, getExternalUrl, setManualExternalUrl, retryUpnp } from '../services/upnp';
import { getInstanceId } from '../db';
import { announceToAllPeers } from '../services/announce';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const upnp = getUpnpState();
  res.json({
    instanceId: getInstanceId(),
    instanceName: config.instanceName,
    externalUrl: getExternalUrl(),
    upnp: {
      active: upnp.active,
      externalIp: upnp.externalIp,
      externalPort: upnp.externalPort,
      error: upnp.error,
    },
  });
});

router.put('/external-url', (req: Request, res: Response) => {
  const { url } = req.body;

  if (url !== null && url !== undefined && typeof url !== 'string') {
    return res.status(400).json({ error: 'url must be a string or null' });
  }

  const cleanUrl = url ? url.replace(/\/+$/, '') : null;
  setManualExternalUrl(cleanUrl);

  if (cleanUrl) {
    announceToAllPeers().catch(() => {});
  }

  res.json({ externalUrl: getExternalUrl() });
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

export default router;
