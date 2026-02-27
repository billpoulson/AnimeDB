<#
.SYNOPSIS
    Downloads and launches AnimeDB via Docker Compose.
.DESCRIPTION
    Downloads the latest AnimeDB source from GitHub, extracts it,
    and starts the application with docker-compose.
.EXAMPLE
    irm https://raw.githubusercontent.com/billpoulson/AnimeDB/main/install.ps1 | iex
#>

$ErrorActionPreference = "Stop"

$Repo       = "billpoulson/AnimeDB"
$Branch     = "main"
$ArchiveUrl = "https://github.com/$Repo/archive/refs/heads/$Branch.zip"
$InstallDir = "AnimeDB"

Write-Host "`n==> Downloading AnimeDB..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $ArchiveUrl -OutFile AnimeDB.zip -UseBasicParsing

Write-Host "==> Extracting..." -ForegroundColor Cyan
Expand-Archive -Path AnimeDB.zip -DestinationPath . -Force
if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
Rename-Item "AnimeDB-$Branch" $InstallDir
Remove-Item AnimeDB.zip

Set-Location $InstallDir

if ((-not (Test-Path .env)) -and (Test-Path .env.example)) {
    Copy-Item .env.example .env
    Write-Host "==> Created .env from .env.example (edit it to configure Plex integration)" -ForegroundColor Yellow
}

Write-Host "==> Starting AnimeDB with Docker Compose..." -ForegroundColor Cyan
try { $sha = git rev-parse HEAD 2>&1 | Out-String } catch { $sha = "" }
if (-not $sha -or $sha -match "fatal") { $sha = "unknown" }
$env:BUILD_SHA = $sha.Trim()
docker compose up --build -d

Write-Host "`nDone! AnimeDB is running at http://localhost:3000" -ForegroundColor Green
