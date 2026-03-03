/**
 * AnimeDB UPnP Tray - Windows system tray app for UPnP when AnimeDB runs in Docker.
 * Runs on the host, discovers router via UPnP, pushes external URL to AnimeDB.
 */

const { app, Tray, Menu, shell, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const upnp = require('./upnp');
const api = require('./api');

/** Log update-check and related messages to userData for debugging. */
function logUpdateCheck(message) {
  try {
    const logPath = path.join(app.getPath('userData'), 'upnp-tray-update.log');
    const line = `${new Date().toISOString()} ${message}\n`;
    fs.appendFileSync(logPath, line);
  } catch (e) {
    console.error('logUpdateCheck', e);
  }
}

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

// Periodically test connectability at the UPnP-resolved external URL and push to AnimeDB
const CONNECTABILITY_CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
let connectabilityCheckTimer = null;
/** Last known connectable state: null = unknown, true/false = last check result */
let lastConnectable = null;

// Auto-update state: null | 'checking' | 'available' | 'downloaded' | 'error' | 'not-available'
let updateStatus = null;
let updateVersion = null;

const ICON_STATUS = {
  green: 'icon-green.png',   // connected and working
  red: 'icon-red.png',       // connection error
  blue: 'icon-blue.png',     // unconfigured
  yellow: 'icon-yellow.png', // authenticating
};

function getIconPath(status) {
  const name = ICON_STATUS[status] || ICON_STATUS.blue;
  return path.join(__dirname, name);
}

function getTrayStatus() {
  if (loginWindow && !loginWindow.isDestroyed()) return 'yellow';
  if (lastError) return 'red';
  if (lastUrl) return 'green';
  return 'blue';
}

function updateTrayIcon() {
  if (!tray) return;
  const status = getTrayStatus();
  tray.setImage(getIconPath(status));
}

function createTray() {
  tray = new Tray(getIconPath('blue'));
  tray.setToolTip('AnimeDB UPnP');
  updateContextMenu();
}

function updateContextMenu() {
  const status = lastError
    ? `Error: ${lastError}`
    : lastUrl
      ? `Active: ${lastUrl}`
      : 'Starting...';

  const items = [
    { label: status, enabled: false },
  ];
  if (lastUrl) {
    const connectableLabel =
      lastConnectable === true
        ? 'Connectable: Yes — reachable at external URL'
        : lastConnectable === false
          ? 'Connectable: No'
          : 'Connectable: checking...';
    items.push({ label: connectableLabel, enabled: false });
  }
  items.push(
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
  );

  if (app.isPackaged) {
    const updateLabel =
      updateStatus === 'checking'
        ? 'Checking for updates...'
        : updateStatus === 'available'
          ? `Update available: ${updateVersion}`
          : updateStatus === 'downloaded'
            ? 'Restart to install update'
            : updateStatus === 'error'
              ? 'Update check failed'
              : updateStatus === 'not-available'
                ? 'No updates available'
                : 'Check for updates';
    items.push(
      { type: 'separator' },
      {
        label: updateLabel,
        enabled: !['checking', 'downloaded'].includes(updateStatus || ''),
        click: () => checkForUpdates(),
      }
    );
  }

  items.push({ type: 'separator' }, { label: 'Exit', click: () => app.quit() });
  tray.setContextMenu(Menu.buildFromTemplate(items));
  updateTrayIcon();
}

function checkForUpdates() {
  if (!app.isPackaged) return;
  updateStatus = 'checking';
  updateContextMenu();
  runUpdateCheck();
}

function showLoginWindow(urlToPushAfter) {
  if (loginWindow) {
    loginWindow.focus();
    return;
  }
  pendingPushUrl = urlToPushAfter || null;

  loginWindow = new BrowserWindow({
    width: 340,
    height: 240,
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
    updateContextMenu();
  });
  loginWindow.once('ready-to-show', () => {
    loginWindow.show();
    updateContextMenu();
  });
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

async function reportConnectable(url, connectable) {
  lastConnectable = connectable;
  try {
    await api.setConnectable(connectable);
  } catch {
    // non-critical
  }
}

function stopConnectabilityCheckLoop() {
  if (connectabilityCheckTimer) {
    clearInterval(connectabilityCheckTimer);
    connectabilityCheckTimer = null;
  }
}

function startConnectabilityCheckLoop() {
  stopConnectabilityCheckLoop();
  connectabilityCheckTimer = setInterval(async () => {
    if (!lastUrl) return;
    try {
      const reachable = await api.verifyReachableAtUrl(lastUrl);
      await reportConnectable(lastUrl, reachable);
      updateContextMenu();
    } catch {
      // non-critical
    }
  }, CONNECTABILITY_CHECK_INTERVAL_MS);
}

async function runUpnp() {
  lastError = null;
  lastUrl = null;
  lastConnectable = null;
  stopConnectabilityCheckLoop();
  updateContextMenu();
  await reportConnectable(null, false);

  try {
    const result = await upnp.mapPort(PORT);
    lastUrl = result.url;

    const pushed = await pushToAnimeDB(result.url);
    if (pushed) {
      const reachable = await api.verifyReachableAtUrl(result.url);
      await reportConnectable(result.url, reachable);
      startConnectabilityCheckLoop();
      upnp.startRenewalLoop(PORT, PORT, async (renewResult) => {
        lastUrl = renewResult.url;
        const renewed = await pushToAnimeDB(renewResult.url);
        if (renewed) {
          const reachableAgain = await api.verifyReachableAtUrl(renewResult.url);
          await reportConnectable(renewResult.url, reachableAgain);
        }
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
      lastUrl = pendingPushUrl;
      const reachable = await api.verifyReachableAtUrl(pendingPushUrl);
      await reportConnectable(pendingPushUrl, reachable);
      startConnectabilityCheckLoop();
      upnp.startRenewalLoop(PORT, PORT, async (renewResult) => {
        lastUrl = renewResult.url;
        const renewed = await pushToAnimeDB(renewResult.url);
        if (renewed) {
          const reachableAgain = await api.verifyReachableAtUrl(renewResult.url);
          await reportConnectable(renewResult.url, reachableAgain);
        }
        updateContextMenu();
      });
    }
  }
}

function cleanup() {
  stopConnectabilityCheckLoop();
  upnp.stopRenewalLoop();
  reportConnectable(null, false).catch(() => {});
  upnp.unmap(upnp.mappedPort).catch(() => {});
}

const {
  getLatestTrayReleaseTag: getLatestTrayReleaseTagImpl,
} = require('./updateCheck');

async function runUpdateCheck() {
  if (!app.isPackaged) return;
  logUpdateCheck('Update check started');
  const result = await getLatestTrayReleaseTagImpl(fetch, {
    log: (msg) => logUpdateCheck(msg),
  });

  if (result.error && result.error !== 'none') {
    logUpdateCheck(`Update check failed: ${result.error}${result.detail ? ` (${result.detail})` : ''}`);
    updateStatus = 'error';
    updateContextMenu();
    setTimeout(() => {
      updateStatus = null;
      updateContextMenu();
    }, 5000);
    return;
  }

  if (!result.tag) {
    logUpdateCheck('Update check: no tray releases found');
    updateStatus = 'not-available';
    updateContextMenu();
    setTimeout(() => {
      updateStatus = null;
      updateContextMenu();
    }, 3000);
    return;
  }

  logUpdateCheck(`Update check: latest tag ${result.tag}`);
  const { autoUpdater } = require('electron-updater');
  const feedUrl = `https://github.com/billpoulson/AnimeDB/releases/download/${result.tag}/`;
  autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
  autoUpdater.checkForUpdatesAndNotify();
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    updateStatus = 'checking';
    updateContextMenu();
  });
  autoUpdater.on('update-available', (info) => {
    updateStatus = 'available';
    updateVersion = info.version;
    updateContextMenu();
    tray.setToolTip(`AnimeDB UPnP - Update ${info.version} available`);
  });
  autoUpdater.on('update-not-available', () => {
    updateStatus = 'not-available';
    updateContextMenu();
    setTimeout(() => {
      updateStatus = null;
      updateContextMenu();
    }, 3000);
  });
  autoUpdater.on('update-downloaded', () => {
    updateStatus = 'downloaded';
    updateContextMenu();
    tray.setToolTip('AnimeDB UPnP - Restart to install update');
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update ready',
        message: 'A new version has been downloaded. Restart now to install?',
        buttons: ['Restart now', 'Later'],
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall(false, true);
      });
  });
  autoUpdater.on('error', (err) => {
    const msg = err && (err.message || String(err));
    logUpdateCheck(`Update check (autoUpdater): ${msg || 'unknown error'}`);
    updateStatus = 'error';
    updateContextMenu();
    setTimeout(() => {
      updateStatus = null;
      updateContextMenu();
    }, 3000);
  });

  runUpdateCheck();
}

app.whenReady().then(() => {
  api.init(app.getPath('userData'));
  api.loadToken();

  ipcMain.on('login', async (_event, password) => {
    await handleLogin(password);
  });

  createTray();
  runUpnp();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {});
app.on('before-quit', cleanup);
