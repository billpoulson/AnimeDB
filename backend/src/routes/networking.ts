import { Router, Request, Response } from 'express';
import { config } from '../config';
import { getUpnpState, getExternalUrl, setManualExternalUrl } from '../services/upnp';
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

export default router;
