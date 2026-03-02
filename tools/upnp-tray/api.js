/**
 * AnimeDB API client - pushes external URL to AnimeDB running in Docker.
 */

const fs = require('fs');
const path = require('path');

const ANIMEDB_HOST = process.env.ANIMEDB_HOST || 'localhost';
const ANIMEDB_PORT = parseInt(process.env.ANIMEDB_PORT || '3000', 10);
const BASE_URL = `http://${ANIMEDB_HOST}:${ANIMEDB_PORT}`;

let token = null;
let tokenDir = null;

function init(userDataPath) {
  tokenDir = userDataPath;
}

function getTokenPath() {
  if (tokenDir) {
    return path.join(tokenDir, 'token.json');
  }
  return null;
}

function loadToken() {
  const p = getTokenPath();
  if (!p || !fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    token = data.token || null;
  } catch {
    token = null;
  }
  return token;
}

function saveToken(t) {
  token = t;
  const p = getTokenPath();
  if (p) {
    try {
      fs.writeFileSync(p, JSON.stringify({ token: t }), 'utf8');
    } catch {
      /* ignore */
    }
  }
}

function clearToken() {
  token = null;
  const p = getTokenPath();
  if (p && fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

function getAuthHeaders() {
  const t = token || loadToken();
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}

/**
 * Login with password. Creates a long-lived API key for the tray and stores it.
 * API keys survive web UI logout, so the user won't be prompted again.
 */
async function login(password) {
  try {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const loginData = await loginRes.json().catch(() => ({}));
    if (!loginRes.ok) {
      return { success: false, error: loginData.error || `HTTP ${loginRes.status}` };
    }
    const sessionToken = loginData.token;
    if (!sessionToken) {
      return { success: false, error: 'No token in response' };
    }

    // Remove any existing UPnP Tray keys to avoid accumulation
    const listRes = await fetch(`${BASE_URL}/api/keys`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (listRes.ok) {
      const keys = await listRes.json().catch(() => []);
      for (const k of keys) {
        if (k.label === 'UPnP Tray' && k.id) {
          await fetch(`${BASE_URL}/api/keys/${k.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${sessionToken}` },
          });
        }
      }
    }

    // Create a long-lived API key for the tray (survives logout)
    const keyRes = await fetch(`${BASE_URL}/api/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ label: 'UPnP Tray' }),
    });
    const keyData = await keyRes.json().catch(() => ({}));
    if (!keyRes.ok) {
      saveToken(sessionToken);
      return { success: true, token: sessionToken };
    }
    if (keyData.key) {
      saveToken(keyData.key);
      return { success: true, token: keyData.key };
    }
    saveToken(sessionToken);
    return { success: true, token: sessionToken };
  } catch (err) {
    return { success: false, error: err.message || 'Connection failed' };
  }
}

/**
 * Set the external URL on AnimeDB.
 */
async function setExternalUrl(url) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    };
    const res = await fetch(`${BASE_URL}/api/networking/external-url`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ url: url || null, remotelyManaged: true }),
    });
    if (res.status === 401) {
      clearToken();
      return { success: false, error: 'Authentication required', authRequired: true };
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error || `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Connection failed' };
  }
}

/**
 * Check if AnimeDB is reachable and auth status.
 */
async function checkAuth() {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/status`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    return {
      reachable: res.ok,
      authRequired: data.authRequired === true,
      authenticated: data.authenticated === true,
    };
  } catch {
    return { reachable: false, authRequired: false, authenticated: false };
  }
}

module.exports = {
  init,
  setExternalUrl,
  login,
  checkAuth,
  ping: () => fetch(`${BASE_URL}/api/config`).then((r) => r.ok).catch(() => false),
  BASE_URL,
  loadToken,
  clearToken,
  hasToken: () => !!(token || loadToken()),
};
