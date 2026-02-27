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

Write-Host "`n==> Checking prerequisites..." -ForegroundColor Cyan
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
    Write-Host "`nERROR: Docker is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://docs.docker.com/get-docker/ and restart your terminal.`n" -ForegroundColor Yellow
    return
}
try { $dockerVersion = docker version --format '{{.Server.Version}}' 2>&1 | Out-String } catch { $dockerVersion = "" }
if (-not $dockerVersion -or $dockerVersion -match "error") {
    Write-Host "`nERROR: Docker is installed but the daemon is not running." -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again.`n" -ForegroundColor Yellow
    return
}
Write-Host "    Docker found: $($dockerVersion.Trim())" -ForegroundColor Gray

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

Write-Host "==> Resolving build SHA..." -ForegroundColor Cyan
try { $sha = git rev-parse HEAD 2>&1 | Out-String } catch { $sha = "" }
if (-not $sha -or $sha -match "fatal") {
    try {
        $apiUrl = "https://api.github.com/repos/$Repo/commits/$Branch"
        $sha = (Invoke-RestMethod -Uri $apiUrl -Headers @{Accept="application/vnd.github.v3.sha"} -UseBasicParsing)
    } catch { $sha = "unknown" }
}
$sha = "$sha".Trim()
if (Test-Path .env) {
    $envContent = Get-Content .env -Raw
    if ($envContent -match "BUILD_SHA=") {
        $envContent = $envContent -replace "BUILD_SHA=.*", "BUILD_SHA=$sha"
    } else {
        $envContent = $envContent.TrimEnd() + "`nBUILD_SHA=$sha`n"
    }
    Set-Content .env $envContent -NoNewline
} else {
    Set-Content .env "BUILD_SHA=$sha`n" -NoNewline
}
$env:BUILD_SHA = $sha

Write-Host "==> Starting AnimeDB with Docker Compose (SHA: $sha)..." -ForegroundColor Cyan
docker compose up --build -d

Write-Host "`nDone! AnimeDB is running at http://localhost:3000" -ForegroundColor Green
