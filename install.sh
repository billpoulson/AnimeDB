#!/usr/bin/env bash
set -euo pipefail

echo "==> Checking prerequisites..."
if ! command -v docker &>/dev/null; then
    echo ""
    echo "ERROR: Docker is not installed or not in PATH."
    echo "Please install Docker from https://docs.docker.com/get-docker/ and restart your terminal."
    exit 1
fi
if ! docker version --format '{{.Server.Version}}' &>/dev/null; then
    echo ""
    echo "ERROR: Docker is installed but the daemon is not running."
    echo "Please start Docker Desktop (or the Docker service) and try again."
    exit 1
fi
echo "    Docker found: $(docker version --format '{{.Server.Version}}')"

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

echo "==> Resolving build SHA..."
BUILD_SHA=$(git rev-parse HEAD 2>/dev/null || true)
if [ -z "$BUILD_SHA" ]; then
    BUILD_SHA=$(curl -fsSL -H "Accept: application/vnd.github.v3.sha" \
        "https://api.github.com/repos/${REPO}/commits/${BRANCH}" 2>/dev/null || echo "unknown")
fi
if [ -f .env ]; then
    if grep -q "^BUILD_SHA=" .env; then
        sed -i "s/^BUILD_SHA=.*/BUILD_SHA=${BUILD_SHA}/" .env
    else
        echo "BUILD_SHA=${BUILD_SHA}" >> .env
    fi
else
    echo "BUILD_SHA=${BUILD_SHA}" > .env
fi
export BUILD_SHA

echo "==> Starting AnimeDB with Docker Compose (SHA: ${BUILD_SHA})..."
docker compose up --build -d

echo ""
echo "Done! AnimeDB is running at http://localhost:3000"
