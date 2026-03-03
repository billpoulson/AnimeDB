# Changelog

All notable changes to AnimeDB will be documented in this file.

## [Unreleased]

_No unreleased changes._

## [2026-03-09]

### Changed

- **UPnP tray: update check** — Menu state is driven by our own GitHub API result: compare current version with latest tag and set "No updates available" or "Update available: X.X.X" immediately instead of waiting for electron-updater. Fixes menu stuck on "Checking for updates...".
- **UPnP tray: shared menu label** — Update menu label comes from `getUpdateMenuLabel(status, version)` in updateCheck.js so it can be unit and integration tested.

### Added

- **UPnP tray: tests** — Unit tests for `getUpdateMenuLabel`, `isNewerReleaseAvailable`; integration tests (with real GitHub when `RUN_GITHUB_INTEGRATION=1`) for fetch + menu content (current = latest → "No updates available", current < latest → "Update available: …").
- **Upgrade test** — Step 3 builds backend only (not root) so the test completes when root build is frontend-only.

### Added (tooling)

- **Install script** — install_v47.ps1 (replace v46).

## [2026-03-08]

### Changed

- **UPnP tray: connectable** — Treat any HTTP response from the external URL (including 401) as connectable; only network errors (timeout, ECONNREFUSED) count as not connectable. Fixes "Connectable: No" when the server is reachable but `/api/config` requires auth.
- **UPnP tray: update check** — 25s timeout so the menu does not stay on "Checking for updates..." if electron-updater never responds.

### Added (tooling)

- **Install script** — install_v46.ps1 (replace v45).

## [2026-03-07]

### Changed

- **UPnP tray** — "View log" context menu item ensured (opens update/connectability log or its folder).

### Added (tooling)

- **Install script** — install_v45.ps1 (replace v44).

## [2026-03-06]

### Added

- **UPnP tray (date versioning)** — Tray release tag and installer use date versioning (e.g. `upnp-tray-v2026.03.06`, `AnimeDB UPnP Setup 2026.03.06.exe`). Update check supports both date and semver tags; release script sets `package.json` version to release date before build.
- **UPnP tray: update-check logging** — When the update check fails or runs, the tray writes to `%APPDATA%\animedb-upnp-tray\upnp-tray-update.log` (attempt, HTTP status, rate limit, network error, or “no tray releases”). README documents the log path.
- **UPnP tray: tests for log output** — Unit tests verify the update-check module calls the log callback with the expected messages on success, rate limit, server error, no tray releases, network error, and null fetch.

### Changed

- **ADR** — Tray uses date versioning for tag and artifact; update check supports date and legacy semver tags.
- **Upgrade test** — Step 3 builds backend only (not root frontend build); failed commands now surface stdout/stderr.

### Added (tooling)

- **Install script** — install_v43.ps1 (replace v42).

## [2026-03-05]

### Added

- **UPnP tray 1.0.7** — Release for update-check testing; ADR updated (installer artifact to use date versioning in filename).
- **UPnP tray 1.0.6** — Update check: retries (3 attempts), 15s timeout, clear "Update check failed" vs "No updates available". Update logic moved to testable `updateCheck.js` (no Electron). Unit tests for parseSemver, compareSemver, getLatestTrayTagFromReleases, getLatestTrayReleaseTag (21 tests).
- **Install script** — install_v42.ps1 (replace v41).

## [2026-03-04]

### Added

- **UPnP tray 1.0.5** — Connectability tested using the UPnP-resolved external URL only. Periodic connectability check every 2 minutes; result is pushed to AnimeDB so the Peers UI stays in sync. Tray context menu shows connectable status (Yes / No / checking…).
- **Peers: connectable always visible when tray-managed** — When the URL is managed by the UPnP helper, the Connectable row is always shown (Yes in green or No in gray). Green dot next to "External URL" when connectable.

### Changed

- **Upgrade test** — Skipped when running in Docker or CI (`CI=true` or `DOCKER=1`).

### Added (tests / tooling)

- **E2E: external URL and connectable** — Playwright tests for Peers: external URL from UPnP tray, connectable indicator in tray flow and UPnP section, UPnP active display with external port.
- **Install script** — install_v41.ps1 (replace v40).

## [2026-03-03]

### Added

- **UPnP section shows connectable status** — The Peers → Networking UPnP block now shows connectable status (Connectable: Yes — reachable at external URL, or Connectable: No) when an external URL is set. When the instance is remotely managed by the UPnP tray, the Connectable row still appears below External URL when reachable.
- **Managed by UPnP helper** — The “Managed by UPnP helper” message is shown directly below the External URL input when the URL is managed by the tray.
- **Tests for connectable** — Unit tests (Peers), e2e (Playwright Peers connectable status), and backend integration tests (connectable status change) for the connectable flow.
- **UPnP tray: View log** — Tray context menu has a "View log" item that opens the update/connectability log file (or its folder if the file does not exist yet).
- **Release script: latest.yml patch** — Before uploading, the script patches `latest.yml` so its `path` and `url` match the actual setup exe filename (electron-builder uses dashes, NSIS output uses spaces); the in-app updater can then download the update correctly.

### Changed

- **UPnP tray: connectability** — Prefer IPv4 for DNS so the connectability check matches browser behavior; add a short delay after UPnP setup before the first check; log connectability failures to the same log file with a `Connectability:` prefix so the exact error is visible.
- **Cursor rules** — Release process and date-versioning rule updated: full sequence (version, commit, push, build, publish, verify), requirement to attach setup exe and latest.yml, and that latest.yml path/url must match the exe (script patches it).

### Added (tooling)

- **Install script** — install_v44.ps1 (replace v43).

## [2026-03-02]

### Added

- **Connectable on Peers screen** — When the UPnP Tray (or another client) has verified that AnimeDB is reachable at its external URL, the Peers → Networking section shows “Connectable: Yes — reachable at external URL”. The tray verifies reachability after mapping and on each renewal, and reports the result to the backend so the web UI can display it.
- **UPnP Tray icon status** — The tray icon shows green when connected, red on error, blue when unconfigured, and yellow while authenticating.
- **UPnP Tray auto-update** — The Windows UPnP Tray app checks for updates on startup and via "Check for updates" in the context menu. Updates are delivered from GitHub Releases (tag prefix `upnp-tray-v`). When an update is downloaded, you're prompted to restart to install.
- **UPnP URL auto-refresh** — Backend UPnP service now checks external IP every 5 minutes (in addition to the 20-minute lease renewal), so IP changes are detected and remapped sooner. When the instance is initially unreachable after mapping ("port mapping may not have propagated yet"), the service retries reachability every 90 seconds (up to 10 times) until it succeeds.
- **API key permissions** — Keys can be scoped to specific capabilities. When creating a key, choose Full access, Federation sync only (peer can sync but not modify your collection), Networking only (e.g. for UPnP Tray), or Custom. The UPnP Tray app now creates a networking-only key. See Docs → API Key Permissions.
- **AnimeDB UPnP Tray (Windows)** — System tray app for Docker on Windows. Runs on the host, discovers the router via UPnP, and pushes the external URL to AnimeDB. Login creates a long-lived API key so you won't be prompted again after web logout. See `tools/upnp-tray/README.md`.
- **Test coverage for auto-sync** — Frontend Peers tests for auto-sync toggle and library picker; backend peerSync unit tests; Docker p2p integration tests for PATCH auto_replicate.
- **Auto-sync peer library** — Enable Auto-sync on a linked peer to automatically pull new content as it is added on the remote. Polls every 15 minutes (configurable via `PEER_SYNC_INTERVAL_MINUTES`). Optionally choose a target library for auto-move.
- **Plex Section Picker** — Fetches library sections from the Plex server and replaces manual section ID inputs with dropdowns. Includes "Refresh sections" button, 15-minute auto-refresh, and per-library section override in the library form.
- **Plex OAuth flow** — Link with Plex via PIN authorization instead of manual token lookup. Use "Link with Plex" or "Re-link with Plex" in Settings.
- **Upgrade test** — Validates upgrading from the previous version to the current version before release.
- **Settings and Peers tests** — Unit tests for Settings sidebar layout and Peers UPnP retry. E2E tests for Settings hash navigation.

### Changed

- **Auth** — API keys accepted for protected routes (e.g. networking). Enables UPnP tray to use a long-lived key instead of session token.
- **Settings screen** — Sidebar navigation (Libraries, Integrations, Updates, Security) with hash-based section links. Responsive layout: horizontal pill tabs on mobile.
- **Plex Integration** — Moved to its own screen at Settings → Integrations → Plex. Integrations section shows a Plex icon card linking to the Plex settings page.

### Fixed

- **Copy to clipboard** — Connection string, API key, and Plex PIN copy now work over HTTP (non-HTTPS) using execCommand fallback when Clipboard API is unavailable.
- **UPnP Retry** — Retry now creates a fresh UPnP client instead of reusing a stale one from a failed discovery, so retries can succeed when the initial attempt times out. Frontend now shows error messages when retry fails or when an invalid port is entered.
- **Plex Section Picker** — Backend `/plex/sections` API now implemented; was returning HTML instead of JSON.
- **Docker in-app update** — Fixes "Command failed: npx tsc" error when updating from the Settings screen (Express 5 type compatibility).
- **Plex Link logout** — Fixes user being logged out when Plex PIN authorization completes (query param conflict with auth).
- **Plex server picker** — Shows server selection even when Plex API returns no servers; allows manual URL entry.
- **Update check** — Correctly detects and displays update failure when poll returns `updateInProgress: false`.
