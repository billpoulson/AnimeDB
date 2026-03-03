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
  - May use their own scheme. The UPnP Tray uses semantic versioning in `package.json` (e.g. `1.0.2`) and release tags with a prefix: `upnp-tray-v1.0.2`, so it stays distinct from main app tags and supports its own auto-updater.

- **Artifacts**
  - Built artifacts (installers, archives) are named with the same version as the release or sub-project they belong to (e.g. release tag `v2026.03.03` → artifacts referenced in that release; tray `1.0.2` → `AnimeDB UPnP Setup 1.0.2.exe`).

## Consequences

- **Pros**
  - No need to decide “major vs minor vs patch” for the main app.
  - Version string doubles as release date.
  - Easy to sort and compare (chronological).
  - Aligns with a “release when ready” workflow.

- **Cons**
  - Less signal about “breaking” vs “compatible” for the main app (mitigated by CHANGELOG and docs).
  - Sub-projects that need semver (e.g. for updaters) keep their own version and tag format.

## References

- CHANGELOG.md uses `[YYYY-MM-DD]` sections.
- Git tags for main app: `vYYYY.MM.DD` or `vYYYY.MM.DD.N` (N ≥ 2) for same-day releases.
- Install script versioning: `.cursorrules` (Commit Checklist) and README.
- UPnP Tray: `tools/upnp-tray/package.json` and README (tag prefix `upnp-tray-v`).
