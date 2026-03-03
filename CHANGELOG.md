# Changelog

All notable changes to AnimeDB will be documented in this file.

## [Unreleased]

_No unreleased changes._

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
