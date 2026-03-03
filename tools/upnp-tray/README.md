# AnimeDB UPnP Tray (Windows)

A small Windows system tray app that handles UPnP when AnimeDB runs in Docker. Docker Desktop on Windows cannot do UPnP from inside containers, so this app runs on the host, discovers your router, creates the port mapping, and pushes the external URL to AnimeDB.

## Requirements

- Windows 10/11
- AnimeDB running in Docker (e.g. `docker compose up -d`)
- Node.js 18+ (for development) or use the built installer

## Quick Start

1. Start AnimeDB with Docker:
   ```powershell
   docker compose up -d
   ```

2. Install and run the tray app:
   ```powershell
   cd tools/upnp-tray
   npm install
   npm start
   ```

3. The app will appear in the system tray. Right-click for options:
   - **Open AnimeDB** — Opens http://localhost:3000
   - **Retry UPnP** — Retry discovery if it failed
   - **Login** — Enter your AnimeDB password (required when auth is enabled)
   - **Exit** — Quit and remove the port mapping

4. If AnimeDB has a password set, you'll see "Authentication required". Click **Login**, enter your password. The app creates a long-lived API key ("UPnP Tray") with networking-only permission and stores it — you won't be prompted again even if you log out from the web UI. The key can only manage the external URL; it cannot access downloads, peers, or other data.

## Configuration

Environment variables (set before `npm start` or in a shortcut):

| Variable | Default | Description |
|----------|---------|--------------|
| `ANIMEDB_HOST` | `localhost` | Host where AnimeDB is reachable |
| `ANIMEDB_PORT` | `3000` | Port AnimeDB listens on (must match Docker port mapping) |

## Building an Installer

```powershell
npm run build
```

Creates an installer in `dist/`. You can distribute this so users don't need Node.js.

## Logs

When the update check fails, the tray writes messages to a log file so you can see why (e.g. rate limit, network error, no tray releases). The file is created in the app's user data folder:

- **Path:** `%APPDATA%\animedb-upnp-tray\upnp-tray-update.log` (when running the built app)
- Each line is timestamped. Check the latest entries after using "Check for updates" or when the tray shows an update error.

## Auto-Update

The tray app checks for updates on startup and via "Check for updates" in the context menu. Updates are delivered from GitHub Releases. The tray looks for releases whose **tag starts with `upnp-tray-v`** (e.g. `upnp-tray-v1.0.2`) so it does not conflict with the main AnimeDB app releases in the same repo. When an update is downloaded, you're prompted to restart to install.

### Publishing a Tray Update

1. Bump `version` in `package.json` (e.g. to `1.0.3`).
2. Build: `npm run build`
3. Create a GitHub release at https://github.com/billpoulson/AnimeDB/releases/new:
   - **Tag:** `upnp-tray-v1.0.3` (prefix `upnp-tray-v` + version, no space)
   - **Upload assets:** `dist/AnimeDB UPnP Setup 1.0.3.exe` and `dist/latest.yml`
   - Publish (or save as draft)

Existing tray installs will find this update when they run "Check for updates".

### Testing Auto-Update

1. Build and run the current version:
   ```powershell
   npm run build
   .\dist\win-unpacked\AnimeDB UPnP.exe
   ```

2. Build a test update (creates new-version artifacts, restores package.json):
   ```powershell
   npm run build-test-update
   ```

3. Create a GitHub release with tag `upnp-tray-vX.Y.Z` (e.g. `upnp-tray-v1.0.2`) and upload the Setup exe and `latest.yml` from `dist/`.

4. With the older app running from step 1, right-click the tray icon and choose **Check for updates**. The app should find the new version, download it, and prompt to restart.

## How It Works

1. On startup, the app discovers your router via UPnP (multicast on the LAN).
2. Creates a port mapping: external port 3000 → your PC's port 3000.
3. Calls `PUT http://localhost:3000/api/networking/external-url` with the discovered URL.
4. Renews the mapping every 20 minutes (router leases typically expire in 1 hour).
5. On exit, removes the port mapping.

## Tray Icon Colors

The tray icon reflects connection status:
- **Green** — Connected and working (UPnP mapped, URL pushed to AnimeDB)
- **Red** — Connection error (UPnP failed, AnimeDB unreachable, etc.)
- **Blue** — Unconfigured or starting
- **Yellow** — Authenticating (login window open)

## Troubleshooting

- **"AnimeDB unreachable"** — Ensure Docker is running and AnimeDB is up. Check `http://localhost:3000/api/config`.
- **"UPnP failed"** — Router may have UPnP disabled, or you're behind CGNAT. Set `EXTERNAL_URL` manually in AnimeDB instead.
- **Tray icon missing** — Replace `icon.png` with a 16x16 or 32x32 PNG if needed.
