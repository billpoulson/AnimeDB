# Changelog

All notable changes to AnimeDB will be documented in this file.

## [Unreleased]

### Added

- **Plex OAuth flow** — Link with Plex via PIN authorization instead of manual token lookup. Use "Link with Plex" or "Re-link with Plex" in Settings.
- **Upgrade test** — Validates upgrading from the previous version to the current version before release.

### Changed

- **Plex Settings** — "Link with Plex" and "Re-link with Plex" buttons now visible even when Plex is already configured.

### Fixed

- **Docker in-app update** — Fixes "Command failed: npx tsc" error when updating from the Settings screen (Express 5 type compatibility).
