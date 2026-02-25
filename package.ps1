<#
.SYNOPSIS
    Packages AnimeDB for distribution as a zip file ready for docker-compose.
.DESCRIPTION
    Runs tests, builds the frontend, and creates a clean zip with only the
    files needed to run via docker-compose.
.EXAMPLE
    .\package.ps1
    .\package.ps1 -SkipTests
    .\package.ps1 -OutputPath "C:\dist\AnimeDB.zip"
#>

param(
    [string]$OutputPath = ".\AnimeDB.zip",
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

function Invoke-Npm {
    param([string]$Dir, [string]$Command)
    Push-Location $Dir
    try {
        cmd /c "npm $Command"
        if ($LASTEXITCODE -ne 0) { throw "npm $Command failed in $Dir" }
    } finally {
        Pop-Location
    }
}

# --- Install dependencies (skip if already present) ---
if (-not (Test-Path "$Root\backend\node_modules")) {
    Write-Step "Installing backend dependencies"
    Invoke-Npm "$Root\backend" "install"
}

if (-not (Test-Path "$Root\frontend\node_modules")) {
    Write-Step "Installing frontend dependencies"
    Invoke-Npm "$Root\frontend" "install"
}

# --- Run tests ---
if (-not $SkipTests) {
    Write-Step "Running backend tests"
    Invoke-Npm "$Root\backend" "test"

    Write-Step "Running frontend tests"
    Invoke-Npm "$Root\frontend" "test"
}

# --- Build frontend ---
Write-Step "Building frontend"
Invoke-Npm "$Root\frontend" "run build"

# --- Assemble staging directory ---
Write-Step "Assembling package"
$Stage = Join-Path $Root ".package-staging\AnimeDB"
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Path $Stage | Out-Null

$include = @(
    "backend\src",
    "backend\tests",
    "backend\package.json",
    "backend\package-lock.json",
    "backend\tsconfig.json",
    "backend\vitest.config.ts",
    "frontend\src",
    "frontend\tests",
    "frontend\dist",
    "frontend\package.json",
    "frontend\package-lock.json",
    "frontend\tsconfig.json",
    "frontend\vite.config.ts",
    "frontend\vitest.config.ts",
    "frontend\postcss.config.js",
    "frontend\tailwind.config.js",
    "frontend\index.html",
    "e2e\app.spec.ts",
    "e2e\package.json",
    "e2e\package-lock.json",
    "e2e\playwright.config.ts",
    "Dockerfile",
    "docker-compose.yml",
    ".dockerignore",
    ".env.example",
    ".gitignore",
    "README.md",
    "DESIGN.md",
    "install.ps1",
    "install.sh"
)

foreach ($item in $include) {
    $src = Join-Path $Root $item
    if (-not (Test-Path $src)) { continue }

    $dest = Join-Path $Stage $item
    $destDir = Split-Path $dest -Parent
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }

    if (Test-Path $src -PathType Container) {
        Copy-Item $src $dest -Recurse
    } else {
        Copy-Item $src $dest
    }
}

# --- Create zip ---
Write-Step "Creating $OutputPath"
$OutFull = [System.IO.Path]::GetFullPath((Join-Path $Root $OutputPath))
if (Test-Path $OutFull) { Remove-Item $OutFull -Force }
Compress-Archive -Path (Join-Path $Root ".package-staging\AnimeDB") -DestinationPath $OutFull

# --- Cleanup ---
Remove-Item (Join-Path $Root ".package-staging") -Recurse -Force

$size = [math]::Round((Get-Item $OutFull).Length / 1MB, 1)
Write-Host "`nDone! Package created: $OutFull ($size MB)" -ForegroundColor Green
Write-Host "Your friend just needs to:" -ForegroundColor Yellow
Write-Host "  1. Unzip"
Write-Host "  2. cp .env.example .env  (and optionally fill in Plex details)"
Write-Host "  3. docker-compose up -d"
Write-Host "  4. Open http://localhost:3000"
