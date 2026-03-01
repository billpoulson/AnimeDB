# AnimeDB

A self-hosted anime download manager with a web UI. Downloads videos via yt-dlp, organizes them into a Plex-compatible library structure, and optionally triggers Plex library scans.

## One-Line Install

The install scripts download the repo, extract it, and start the app with Docker Compose.

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

**PowerShell (Windows):**

```powershell
irm https://raw.githubusercontent.com/billpoulson/AnimeDB/main/install.ps1 | iex
```

If the CDN is serving a stale version, use the versioned script instead:

```powershell
irm https://raw.githubusercontent.com/billpoulson/AnimeDB/main/install_v26.ps1 | iex
```

**Bash (Linux / macOS):**

```bash
curl -fsSL https://raw.githubusercontent.com/billpoulson/AnimeDB/main/install.sh | bash
```

Once finished, open **http://localhost:3000**.

---

## Manual Setup (Docker)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### 1. Clone & configure

```bash
git clone https://github.com/billpoulson/AnimeDB.git
cd AnimeDB
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `OUTPUT_FORMAT` | No | Video container format (default: `mkv`) |
| `PLEX_URL` | No | Plex server URL, e.g. `http://192.168.1.50:32400` |
| `PLEX_TOKEN` | No | Plex authentication token |
| `PLEX_SECTION_MOVIES` | No | Plex library section ID for movies (default: `1`) |
| `PLEX_SECTION_TV` | No | Plex library section ID for TV shows (default: `2`) |
| `PLEX_CLIENT_ID` | No | Stable client ID for Plex OAuth (default: auto-generated) |
| `EXTERNAL_URL` | No | Override the auto-discovered external URL for federation |

Plex integration is entirely optional. If you leave `PLEX_URL` and `PLEX_TOKEN` empty, everything else works normally.

**Preferred setup:** Use **Settings → Link with Plex** in the web UI. This opens a Plex authorization page where you sign in and approve AnimeDB; your token and server URL are then saved automatically. No manual token lookup is required.

### Networking

By default the container uses bridge networking with port **3000** mapped to the host. This works on all platforms.

For **UPnP auto-discovery** (Linux only), set `NETWORK_MODE=host` in your `.env` file. This gives the container direct LAN access so it can discover your router and create port mappings automatically.

On **Windows/Mac** with Docker Desktop, UPnP cannot work through Docker's VM. Set `EXTERNAL_URL` in `.env` manually if you need peer federation.

### 2. Start the application

```bash
docker-compose up -d
```

### 3. Open the UI

Go to **http://localhost:3000** in your browser.

### Usage

1. Paste a YouTube URL, pick a category (movie / TV / other), and submit.
2. The download runs in the background — progress is shown in the UI.
3. Once complete, press the **Move to Library** button to organize the file into your media folder and trigger a Plex scan (if configured).

### Data & Volumes

| Path in container | Mapped to | Purpose |
|---|---|---|
| `/data` | Docker volume `animedb-data` | SQLite database (persisted across restarts) |
| `/downloads` | `./downloads` on host | Temporary download staging area |
| `/media` | `./media` on host | Organized media library |

### Stopping

```bash
docker-compose down
```

Database data is preserved in the `animedb-data` Docker volume. Downloads and media files live on the host filesystem.
