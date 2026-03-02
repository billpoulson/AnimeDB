/**
 * AnimeDB UPnP Tray - Windows system tray app for UPnP when AnimeDB runs in Docker.
 * Runs on the host, discovers router via UPnP, pushes external URL to AnimeDB.
 */

const { app, Tray, Menu, shell, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const upnp = require('./upnp');
const api = require('./api');

const PORT = parseInt(process.env.ANIMEDB_PORT || '3000', 10);

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
const ANIMEDB_URL = `http://localhost:${PORT}`;

let tray = null;
let lastUrl = null;
let lastError = null;
let loginWindow = null;
let pendingPushUrl = null;

function getIconPath() {
  return path.join(__dirname, 'icon.png');
}

function createTray() {
  tray = new Tray(getIconPath());
  tray.setToolTip('AnimeDB UPnP');
  updateContextMenu();
}

function updateContextMenu() {
  const status = lastError
    ? `Error: ${lastError}`
    : lastUrl
      ? `Active: ${lastUrl}`
      : 'Starting...';

  const contextMenu = Menu.buildFromTemplate([
    { label: status, enabled: false },
    { type: 'separator' },
    {
      label: 'Open AnimeDB',
      click: () => shell.openExternal(ANIMEDB_URL),
    },
    {
      label: 'Retry UPnP',
      click: () => runUpnp(),
    },
    {
      label: 'Login',
      click: () => showLoginWindow(),
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function showLoginWindow(urlToPushAfter) {
  if (loginWindow) {
    loginWindow.focus();
    return;
  }
  pendingPushUrl = urlToPushAfter || null;

  loginWindow = new BrowserWindow({
    width: 320,
    height: 180,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-login.js'),
      contextIsolation: true,
    },
  });
  loginWindow.setMenu(null);
  loginWindow.loadFile(path.join(__dirname, 'login.html'));
  loginWindow.on('closed', () => {
    loginWindow = null;
    pendingPushUrl = null;
  });
  loginWindow.once('ready-to-show', () => loginWindow.show());
}

async function pushToAnimeDB(url) {
  const result = await api.setExternalUrl(url);
  if (result.success) {
    lastError = null;
    return true;
  }
  if (result.authRequired) {
    lastError = 'Authentication required';
    showLoginWindow(url);
    return false;
  }
  lastError = result.error;
  return false;
}

async function runUpnp() {
  lastError = null;
  lastUrl = null;
  updateContextMenu();

  try {
    const result = await upnp.mapPort(PORT);
    lastUrl = result.url;

    const pushed = await pushToAnimeDB(result.url);
    if (pushed) {
      upnp.startRenewalLoop(PORT, PORT, async (renewResult) => {
        lastUrl = renewResult.url;
        await pushToAnimeDB(renewResult.url);
        updateContextMenu();
      });
    } else if (lastError !== 'Authentication required') {
      lastError = `UPnP OK but AnimeDB unreachable: ${lastError}`;
    }
  } catch (err) {
    lastError = err.message || 'UPnP failed';
    upnp.stopRenewalLoop();
  }

  updateContextMenu();
}

async function handleLogin(password) {
  const result = await api.login(password);
  if (!result.success) {
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.webContents.send('login-error', result.error);
    }
    return;
  }
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.close();
  }
  lastError = null;
  updateContextMenu();
  if (pendingPushUrl) {
    const ok = await pushToAnimeDB(pendingPushUrl);
    if (ok) {
      upnp.startRenewalLoop(PORT, PORT, async (renewResult) => {
        lastUrl = renewResult.url;
        await pushToAnimeDB(renewResult.url);
        updateContextMenu();
      });
    }
  }
}

function cleanup() {
  upnp.stopRenewalLoop();
  upnp.unmap(upnp.mappedPort).catch(() => {});
}

app.whenReady().then(() => {
  api.init(app.getPath('userData'));
  api.loadToken();

  ipcMain.on('login', async (_event, password) => {
    await handleLogin(password);
  });

  createTray();
  runUpnp();
});

app.on('window-all-closed', () => {});
app.on('before-quit', cleanup);
