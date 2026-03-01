# Changelog

All notable changes to AnimeDB will be documented in this file.

## [Unreleased]

### Added

- **Plex Section Picker** — Fetches library sections from the Plex server and replaces manual section ID inputs with dropdowns. Includes "Refresh sections" button, 15-minute auto-refresh, and per-library section override in the library form.
- **Plex OAuth flow** — Link with Plex via PIN authorization instead of manual token lookup. Use "Link with Plex" or "Re-link with Plex" in Settings.
- **Upgrade test** — Validates upgrading from the previous version to the current version before release.

### Changed

- **Plex Settings** — "Link with Plex" and "Re-link with Plex" buttons now visible even when Plex is already configured.

### Fixed

- **Docker in-app update** — Fixes "Command failed: npx tsc" error when updating from the Settings screen (Express 5 type compatibility).
- **Plex Link logout** — Fixes user being logged out when Plex PIN authorization completes (query param conflict with auth).
- **Plex server picker** — Shows server selection even when Plex API returns no servers; allows manual URL entry.
- **Update check** — Correctly detects and displays update failure when poll returns `updateInProgress: false`.
