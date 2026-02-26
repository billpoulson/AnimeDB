<#
.SYNOPSIS
    Migrates local AnimeDB data (downloads, media, database) into the
    Docker bind-mount layout so you can switch to Docker without re-downloading.
.EXAMPLE
    .\migrate-to-docker.ps1
    .\migrate-to-docker.ps1 -BackendDir .\backend
#>

param(
    [string]$BackendDir = ".\backend"
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

$localDownloads = Join-Path $BackendDir "downloads"
$localMedia     = Join-Path $BackendDir "media"
$localDb        = Join-Path $BackendDir "data" "animedb.sqlite"

$dockerDownloads = Join-Path $Root "downloads"
$dockerMedia     = Join-Path $Root "media"
$dockerData      = Join-Path $Root "data"
$dockerDb        = Join-Path $dockerData "animedb.sqlite"

# --- Validate source ---
if (-not (Test-Path $localDb)) {
    Write-Host "Database not found at $localDb" -ForegroundColor Red
    Write-Host "Make sure you've run the app locally at least once." -ForegroundColor Yellow
    exit 1
}

# --- Copy downloads ---
if (Test-Path $localDownloads) {
    Write-Step "Copying downloads..."
    if (-not (Test-Path $dockerDownloads)) { New-Item -ItemType Directory -Path $dockerDownloads | Out-Null }
    $items = Get-ChildItem $localDownloads
    $total = $items.Count
    $i = 0
    foreach ($item in $items) {
        $i++
        $dest = Join-Path $dockerDownloads $item.Name
        if (-not (Test-Path $dest)) {
            Write-Host "  [$i/$total] $($item.Name)"
            Copy-Item $item.FullName $dest -Recurse
        } else {
            Write-Host "  [$i/$total] $($item.Name) (already exists, skipping)"
        }
    }
} else {
    Write-Host "No local downloads directory found, skipping." -ForegroundColor Yellow
}

# --- Copy media ---
if (Test-Path $localMedia) {
    Write-Step "Copying media..."
    if (-not (Test-Path $dockerMedia)) { New-Item -ItemType Directory -Path $dockerMedia | Out-Null }
    $items = Get-ChildItem $localMedia
    $total = $items.Count
    $i = 0
    foreach ($item in $items) {
        $i++
        $dest = Join-Path $dockerMedia $item.Name
        if (-not (Test-Path $dest)) {
            Write-Host "  [$i/$total] $($item.Name)"
            Copy-Item $item.FullName $dest -Recurse
        } else {
            Write-Host "  [$i/$total] $($item.Name) (already exists, skipping)"
        }
    }
} else {
    Write-Host "No local media directory found, skipping." -ForegroundColor Yellow
}

# --- Copy and patch database ---
Write-Step "Copying database..."
if (-not (Test-Path $dockerData)) { New-Item -ItemType Directory -Path $dockerData | Out-Null }
Copy-Item $localDb $dockerDb -Force

Write-Step "Rewriting file paths for Docker..."
$resolvedDownloads = (Resolve-Path $localDownloads -ErrorAction SilentlyContinue)?.Path ?? $localDownloads
$resolvedMedia     = (Resolve-Path $localMedia -ErrorAction SilentlyContinue)?.Path ?? $localMedia

Push-Location (Join-Path $Root "backend")
try {
    npx tsx src/migrate-db.ts $dockerDb $resolvedDownloads $resolvedMedia
    if ($LASTEXITCODE -ne 0) { throw "Path rewrite failed" }
} finally {
    Pop-Location
}

Write-Host "`n" -NoNewline
Write-Host "Migration complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  downloads -> $dockerDownloads"
Write-Host "  media     -> $dockerMedia"
Write-Host "  database  -> $dockerDb"
Write-Host ""
Write-Host "Now start Docker:" -ForegroundColor Yellow
Write-Host "  docker compose up -d --build"
Write-Host "  Open http://localhost:3000"
