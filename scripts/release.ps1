<#
.SYNOPSIS
    Creates a new AnimeDB release with date versioning and includes the UPnP Tray setup exe.
.DESCRIPTION
    Builds the UPnP Tray, then creates a GitHub release with tag vYYYY.MM.DD (or vYYYY.MM.DD.N
    for multiple releases the same day) and attaches the Tray setup exe and latest.yml.
.PARAMETER Date
    Release date for the main app tag (YYYY-MM-DD). Default: today.
.PARAMETER Sequence
    Optional. Same-day sequence number (2, 3, ...). If omitted, the script uses the first
    release of the day (vYYYY.MM.DD) or auto-detects the next N from existing tags.
.PARAMETER SkipTrayRelease
    If set, only create the main app release; do not create the tray release (upnp-tray-vYYYY.MM.DD).
.PARAMETER DryRun
    Build tray and show what would be done; do not create releases.
.EXAMPLE
    .\scripts\release.ps1
.EXAMPLE
    .\scripts\release.ps1 -Date "2026-03-03" -Sequence 2
#>

param(
    [string] $Date = (Get-Date -Format "yyyy-MM-dd"),
    [int] $Sequence = 0,
    [switch] $SkipTrayRelease,
    [switch] $DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$dateDot = $Date -replace '-', '.'
$tagBase = "v" + $dateDot

# Resolve tag: vYYYY.MM.DD (first of day) or vYYYY.MM.DD.N (N >= 2)
if ($Sequence -ge 2) {
    $tag = "${tagBase}.$Sequence"
} else {
    $existing = @(git tag -l "${tagBase}*" 2>$null)
    $hasBase = $existing -contains $tagBase
    $maxN = 0
    $tagBaseEscaped = [regex]::Escape($tagBase)
    foreach ($t in $existing) {
        if ($t -match "^${tagBaseEscaped}\.(\d+)$") {
            $n = [int]$Matches[1]
            if ($n -gt $maxN) { $maxN = $n }
        }
    }
    if (-not $hasBase -and $maxN -eq 0) {
        $tag = $tagBase
    } else {
        $nextN = [Math]::Max(2, $maxN + 1)
        $tag = "${tagBase}.${nextN}"
    }
}
$trayDir = Join-Path $RepoRoot "tools\upnp-tray"
$distDir = Join-Path $trayDir "dist"
$pkgPath = Join-Path $trayDir "package.json"

# Tray uses date versioning: version and tag match main app date (e.g. 2026.03.05)
$trayVersion = $dateDot

Write-Host "`n==> Release: $tag (date: $Date)" -ForegroundColor Cyan
Write-Host "    Repo root: $RepoRoot" -ForegroundColor Gray
Write-Host "    Tray version (date): $trayVersion`n" -ForegroundColor Gray

# 1. Set tray package.json version to date, then build
Write-Host "==> Building UPnP Tray (version $trayVersion)..." -ForegroundColor Cyan
$pkgRaw = Get-Content $pkgPath -Raw
if ($pkgRaw -match '"version":\s*"([^"]*)"') { $previousVersion = $Matches[1] } else { $previousVersion = $null }
$pkgRaw = $pkgRaw -replace '"version":\s*"[^"]*"', "`"version`": `"$trayVersion`""
Set-Content $pkgPath -Value $pkgRaw -NoNewline

Push-Location $trayDir
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Tray build failed" }
} finally {
    Pop-Location
}

# 2. Resolve artifact paths (exe name includes date version; electron-builder may normalize e.g. 2026.03.06 -> 2026.3.6)
$trayVersionNormalized = ($trayVersion.Split('.') | ForEach-Object { [int]$_ }) -join '.'
$setupExe1 = Join-Path $distDir "AnimeDB UPnP Setup $trayVersion.exe"
$setupExe2 = Join-Path $distDir "AnimeDB-UPnP-Setup-$trayVersion.exe"
$setupExe3 = Join-Path $distDir "AnimeDB UPnP Setup $trayVersionNormalized.exe"
$setupExe = $null
if (Test-Path $setupExe1) { $setupExe = $setupExe1 }
elseif (Test-Path $setupExe3) { $setupExe = $setupExe3 }
elseif (Test-Path $setupExe2) { $setupExe = $setupExe2 }
if (-not $setupExe) {
    Write-Host "ERROR: Tray setup exe not found (looked for $setupExe1, $setupExe3, or $setupExe2)" -ForegroundColor Red
    if ($previousVersion) {
        $pkgRaw = (Get-Content $pkgPath -Raw) -replace '"version":\s*"[^"]*"', "`"version`": `"$previousVersion`""
        Set-Content $pkgPath -Value $pkgRaw -NoNewline
    }
    exit 1
}

$latestYml = Join-Path $distDir "latest.yml"
if (-not (Test-Path $latestYml)) {
    Write-Host "ERROR: latest.yml not found at $latestYml" -ForegroundColor Red
    exit 1
}

Write-Host "    Tray version: $trayVersion" -ForegroundColor Gray
Write-Host "    Setup exe:    $setupExe" -ForegroundColor Gray
Write-Host "    latest.yml:  $latestYml`n" -ForegroundColor Gray

if ($DryRun) {
    Write-Host "DRY RUN - would create:" -ForegroundColor Yellow
    Write-Host "  1. Release $tag with assets: $([System.IO.Path]::GetFileName($setupExe)), latest.yml" -ForegroundColor Yellow
    if (-not $SkipTrayRelease) {
        Write-Host "  2. Release upnp-tray-v$trayVersion with same assets (for tray auto-updater)" -ForegroundColor Yellow
    }
    Write-Host "`nRun without -DryRun to create releases. Requires: gh auth login" -ForegroundColor Gray
    exit 0
}

# 3. Release notes from CHANGELOG (section for this date)
$changelogPath = Join-Path $RepoRoot "CHANGELOG.md"
$notes = "Release $tag. See CHANGELOG.md for details."
if (Test-Path $changelogPath) {
    $text = Get-Content $changelogPath -Raw
    $sectionDate = $Date
    if ($text -match "(?ms)## \[$([regex]::Escape($sectionDate))\](.*?)(?=## \[|\z)") {
        $notes = $Matches[1].Trim()
        if ($notes.Length -gt 6000) { $notes = $notes.Substring(0, 6000) + "..." }
    }
}

# 4. Create main app release (vYYYY.MM.DD) with tray setup exe + latest.yml
Write-Host "==> Creating release $tag..." -ForegroundColor Cyan
$notesFile = [System.IO.Path]::GetTempFileName()
Set-Content -Path $notesFile -Value $notes -NoNewline

try {
    gh release create $tag `
        --title $tag `
        --notes-file $notesFile `
        "$setupExe" `
        "$latestYml"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: gh release create failed. Is 'gh' installed and authenticated? Run: gh auth login" -ForegroundColor Red
        exit 1
    }
    Write-Host "    Created: $tag" -ForegroundColor Green
} finally {
    Remove-Item $notesFile -ErrorAction SilentlyContinue
}

# 5. Optionally create tray release so in-app updater finds it
if (-not $SkipTrayRelease) {
    $trayTag = "upnp-tray-v$trayVersion"
    Write-Host "==> Creating tray release $trayTag (for in-app updater)..." -ForegroundColor Cyan
    gh release create $trayTag `
        --title "UPnP Tray $trayVersion" `
        --notes "AnimeDB UPnP Tray $trayVersion (date versioning). Use with Docker on Windows when AnimeDB cannot do UPnP from inside the container." `
        "$setupExe" `
        "$latestYml"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARN: Could not create tray release $trayTag (may already exist)" -ForegroundColor Yellow
    } else {
        Write-Host "    Created: $trayTag" -ForegroundColor Green
    }
}

Write-Host "`nDone. Release $tag includes the UPnP Tray setup exe." -ForegroundColor Green
Write-Host "  GitHub: https://github.com/billpoulson/AnimeDB/releases/tag/$tag" -ForegroundColor Gray
