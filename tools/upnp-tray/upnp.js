/**
 * UPnP port mapping - runs on Windows host with direct LAN access.
 */

const natUpnp = require('nat-upnp-2');

const MAPPING_DESCRIPTION = 'AnimeDB';
const MAPPING_TTL = 3600;
const RENEWAL_INTERVAL_MS = 20 * 60 * 1000;

let client = null;
let mappedPort = null;
let renewalTimer = null;

function getClient() {
  if (!client) {
    client = natUpnp.createClient({ timeout: 10000 });
  }
  return client;
}

function pMap(opts) {
  return new Promise((resolve, reject) => {
    getClient().portMapping(opts, (err) => (err ? reject(err) : resolve()));
  });
}

function pUnmap(opts) {
  return new Promise((resolve, reject) => {
    getClient().portUnmapping(opts, (err) => (err ? reject(err) : resolve()));
  });
}

function pExternalIp() {
  return new Promise((resolve, reject) => {
    getClient().externalIp((err, ip) => (err ? reject(err) : resolve(ip)));
  });
}

async function mapPort(publicPort, privatePort = publicPort) {
  try {
    await pUnmap({ public: publicPort });
  } catch {
    /* ignore */
  }

  if (mappedPort && mappedPort !== publicPort) {
    try {
      await pUnmap({ public: mappedPort });
    } catch {
      /* ignore */
    }
  }

  await pMap({
    public: publicPort,
    private: privatePort,
    description: MAPPING_DESCRIPTION,
    ttl: MAPPING_TTL,
  });

  const ip = await pExternalIp();
  mappedPort = publicPort;
  return { url: `http://${ip}:${publicPort}`, ip, port: publicPort };
}

async function renew(publicPort, privatePort) {
  await pMap({
    public: publicPort,
    private: privatePort,
    description: MAPPING_DESCRIPTION,
    ttl: MAPPING_TTL,
  });
  const ip = await pExternalIp();
  return { url: `http://${ip}:${publicPort}`, ip, port: publicPort };
}

async function unmap(port) {
  if (!client || !port) return;
  try {
    await pUnmap({ public: port });
  } catch {
    /* ignore */
  }
  try {
    client.close();
  } catch {
    /* ignore */
  }
  client = null;
  mappedPort = null;
}

function startRenewalLoop(publicPort, privatePort, onRenew) {
  stopRenewalLoop();
  renewalTimer = setInterval(async () => {
    try {
      const result = await renew(publicPort, privatePort);
      if (onRenew) onRenew(result);
    } catch (err) {
      console.error('Renewal failed:', err.message);
    }
  }, RENEWAL_INTERVAL_MS);
}

function stopRenewalLoop() {
  if (renewalTimer) {
    clearInterval(renewalTimer);
    renewalTimer = null;
  }
}

module.exports = {
  mapPort,
  renew,
  unmap,
  startRenewalLoop,
  stopRenewalLoop,
  get mappedPort() {
    return mappedPort;
  },
};
