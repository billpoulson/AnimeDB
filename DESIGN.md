# AnimeDB — YouTube to Plex Library Manager (MVP)

A self-hosted app that downloads YouTube videos via `yt-dlp`, organizes them into a Plex-compatible folder structure, and triggers a library scan. Runs in Docker.

## Architecture

```
[ React Frontend :5173 ]
        |
[ Express API :3000 ]
        |
        +---> yt-dlp (download + merge)
        +---> File mover (rename/organize)
        +---> Plex API (trigger scan)
        |
[ SQLite DB ]        [ Docker Volumes: /downloads, /media ]
```

Single container. No Redis, no job queue library — use a simple in-memory queue backed by SQLite for persistence. This is a personal tool, not a distributed system.

## Tech Stack

| Layer          | Choice                        |
|----------------|-------------------------------|
| Frontend       | React + Vite + TypeScript     |
| Styling        | Tailwind CSS                  |
| Backend        | Express + TypeScript          |
| Database       | SQLite (via better-sqlite3)   |
| Download       | yt-dlp (installed in image)   |
| Merge/Convert  | FFmpeg (installed in image)   |
| Container      | Docker + Docker Compose       |

## API Endpoints

### `POST /api/downloads`
Submit a new download.
```json
{
  "url": "https://youtube.com/watch?v=...",
  "category": "movies" | "tv" | "other",
  "title": "My Video",
  "season": 1,
  "episode": 3
}
```
Returns `{ "id": "uuid", "status": "queued" }`.

### `GET /api/downloads`
List all downloads with status.

### `GET /api/downloads/:id`
Get single download status + progress.

### `DELETE /api/downloads/:id`
Remove a download record (does not delete the file).

### `GET /api/config`
Return current config (output format, plex connection status).

## Database Schema (SQLite)

```sql
CREATE TABLE downloads (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  season INTEGER,
  episode INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  file_path TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

Status values: `queued` | `downloading` | `processing` | `completed` | `failed`

## Download Pipeline

1. Insert record with status `queued`
2. Worker picks it up, sets status to `downloading`
3. Run: `yt-dlp -f bestvideo+bestaudio --merge-output-format mkv -o "/downloads/%(title)s.%(ext)s" <URL>`
   - Parse stdout for progress percentage, update DB
4. Set status to `processing`, move/rename file to Plex structure:
   - Movies: `/media/Movies/{Title}/{Title}.mkv`
   - TV: `/media/TV Shows/{Title}/Season {NN}/{Title} - S{NN}E{NN}.mkv`
   - Other: `/media/Other/{Title}.mkv`
5. Trigger Plex library scan: `POST http://{PLEX_URL}/library/sections/{sectionId}/refresh?X-Plex-Token={TOKEN}`
6. Set status to `completed`

On failure at any step: set status to `failed`, store error message. Retry up to 2 times before giving up.

## Frontend Pages

### 1. Dashboard (main page)
- Input field for YouTube URL
- Category selector (Movie / TV / Other)
- Optional metadata fields (title, season, episode) — shown conditionally for TV
- Submit button
- Active downloads list with status + progress bar

### 2. Library
- Table of all completed downloads
- Shows: title, category, file path, date, plex sync status

That's it. Two pages.

## Environment Variables

```env
# Required
PLEX_URL=http://plex:32400
PLEX_TOKEN=your-token-here

# Optional (with defaults)
OUTPUT_FORMAT=mkv
DOWNLOAD_PATH=/downloads
MEDIA_PATH=/media
PLEX_SECTION_MOVIES=1
PLEX_SECTION_TV=2
PORT=3000
```

## Docker Compose

```yaml
services:
  animedb:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data          # SQLite DB
      - downloads:/downloads       # temp downloads
      - /path/to/plex/media:/media # Plex library
    environment:
      - PLEX_URL=http://plex:32400
      - PLEX_TOKEN=your-token
      - OUTPUT_FORMAT=mkv
    restart: unless-stopped

volumes:
  downloads:
```

## Dockerfile

Based on `node:20-slim`. Install `yt-dlp`, `ffmpeg`, and `tini`. Run as non-root user.

## Project Structure

```
/
  docker-compose.yml
  Dockerfile
  /frontend
    /src
      App.tsx
      /pages
        Dashboard.tsx
        Library.tsx
      /components
        DownloadForm.tsx
        DownloadList.tsx
        ProgressBar.tsx
      /api
        client.ts
  /backend
    /src
      index.ts
      /routes
        downloads.ts
      /services
        downloader.ts      # yt-dlp wrapper
        mediaOrganizer.ts   # file rename/move logic
        plexClient.ts       # Plex API calls
        queue.ts            # simple in-process job queue
      /db
        schema.ts
        index.ts
      config.ts
```

## What's NOT in the MVP

- Authentication (personal tool, runs on local network)
- Redis / BullMQ (overkill for single-user)
- GPU transcoding
- Metadata scraping from TMDB
- Multi-user support
- Webhook subscriptions
- Thumbnail generation
- Custom naming templates
- Kubernetes

These can all be added later if needed.

## Build Order

1. Backend: Express server + SQLite schema + config
2. Backend: yt-dlp download service + progress parsing
3. Backend: File organizer (rename + move to Plex structure)
4. Backend: Plex API client (trigger scan)
5. Backend: Simple queue (process one download at a time)
6. Frontend: Dashboard page with download form + status list
7. Frontend: Library page
8. Docker: Dockerfile + docker-compose.yml
9. Test end-to-end
