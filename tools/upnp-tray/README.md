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

4. If AnimeDB has a password set, you'll see "Authentication required". Click **Login**, enter your password. The app creates a long-lived API key ("UPnP Tray") and stores it — you won't be prompted again even if you log out from the web UI.

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

## How It Works

1. On startup, the app discovers your router via UPnP (multicast on the LAN).
2. Creates a port mapping: external port 3000 → your PC's port 3000.
3. Calls `PUT http://localhost:3000/api/networking/external-url` with the discovered URL.
4. Renews the mapping every 20 minutes (router leases typically expire in 1 hour).
5. On exit, removes the port mapping.

## Troubleshooting

- **"AnimeDB unreachable"** — Ensure Docker is running and AnimeDB is up. Check `http://localhost:3000/api/config`.
- **"UPnP failed"** — Router may have UPnP disabled, or you're behind CGNAT. Set `EXTERNAL_URL` manually in AnimeDB instead.
- **Tray icon missing** — Replace `icon.png` with a 16x16 or 32x32 PNG if needed.
