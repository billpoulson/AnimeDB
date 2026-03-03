# ADR: Date versioning for releases and artifacts

**Status:** Accepted  
**Date:** 2026-03-02  
**Deciders:** Project maintainers

## Context

AnimeDB needs a consistent, low-friction way to version releases and artifacts (Git tags, CHANGELOG sections, install scripts, and optional sub-projects like the UPnP Tray). Semantic versioning (e.g. 1.2.3) adds overhead for a single-maintainer, rolling-release style project and doesn’t map cleanly to “when” a release happened.

## Decision

Use **date-based versioning** for:

- **Main app releases**
  - Git tags: `vYYYY.MM.DD` for the first release of a day (e.g. `v2026.03.02`, `v2026.03.03`). For **multiple releases the same day**, use a fourth segment: `vYYYY.MM.DD.N` with N = 2, 3, … (e.g. `v2026.03.03.2`, `v2026.03.03.3`). The first release of the day stays `vYYYY.MM.DD`; subsequent ones use `.2`, `.3`, etc.
  - CHANGELOG section headings: `[YYYY-MM-DD]` (e.g. `[2026-03-02]`). For same-day releases, use one section per release and/or append to the day’s section as appropriate.
  - No separate “major.minor.patch” for the main app.

- **Install script versioning**
  - Filenames: `install_vN.ps1` where N is an integer that increments per release (e.g. `install_v38.ps1`, `install_v39.ps1`). This is independent of the release date and used to bust CDN cache; README references the current versioned script.

- **Sub-projects (e.g. UPnP Tray)**
  - **Date versioning:** The UPnP Tray uses the same date scheme as the main app. `package.json` `version` is set to the release date (e.g. `2026.03.05`) at release time. Release tags use the prefix and date: `upnp-tray-v2026.03.05`. The in-app update check compares date-version tags and legacy semver tags (date is treated as newer than semver).

- **Artifacts**
  - Built artifacts (installers, archives) are named with the same version as the release or sub-project they belong to (e.g. release tag `v2026.03.03` → artifacts referenced in that release).
  - **UPnP Tray installer:** The setup executable uses **date versioning**: `AnimeDB UPnP Setup 2026.03.05.exe`. The version in `package.json` is set to the release date by the release script before building, so the built app and `latest.yml` use the date string (comparable by semver as YYYY.M.M.D).

## Consequences

- **Pros**
  - No need to decide “major vs minor vs patch” for the main app.
  - Version string doubles as release date.
  - Easy to sort and compare (chronological).
  - Aligns with a “release when ready” workflow.

- **Cons**
  - Less signal about “breaking” vs “compatible” for the main app (mitigated by CHANGELOG and docs).
  - Tray update check must support both date and legacy semver tags during the transition.

## References

- CHANGELOG.md uses `[YYYY-MM-DD]` sections.
- Git tags for main app: `vYYYY.MM.DD` or `vYYYY.MM.DD.N` (N ≥ 2) for same-day releases.
- Install script versioning: `.cursorrules` (Commit Checklist) and README.
- UPnP Tray: `tools/upnp-tray/package.json` version is date (e.g. `2026.03.05`). Tag: `upnp-tray-v2026.03.05`. Installer: `AnimeDB UPnP Setup 2026.03.05.exe`. Release script sets version before build; update check in `updateCheck.js` supports date and semver tags.
