#!/usr/bin/env bash
set -euo pipefail

REPO="billpoulson/AnimeDB"
BRANCH="main"
ARCHIVE_URL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.zip"
INSTALL_DIR="AnimeDB"

echo "==> Downloading AnimeDB..."
curl -fSL -o AnimeDB.zip "$ARCHIVE_URL"

echo "==> Extracting..."
unzip -q AnimeDB.zip
mv "AnimeDB-${BRANCH}" "$INSTALL_DIR"
rm AnimeDB.zip

cd "$INSTALL_DIR"

if [ ! -f .env ] && [ -f .env.example ]; then
    cp .env.example .env
    echo "==> Created .env from .env.example (edit it to configure Plex integration)"
fi

echo "==> Starting AnimeDB with Docker Compose..."
BUILD_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
export BUILD_SHA
docker compose up --build -d

echo ""
echo "Done! AnimeDB is running at http://localhost:3000"
