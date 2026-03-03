/**
 * Update detection for UPnP tray. Fetches GitHub releases, filters by tray tag prefix, returns latest.
 * Supports date-version tags (upnp-tray-v2026.03.05) and legacy semver (upnp-tray-v1.0.7).
 * No Electron dependency so it can be unit tested in Node.
 */

const TRAY_RELEASE_TAG_PREFIX = 'upnp-tray-v';
const GITHUB_RELEASES_API = 'https://api.github.com/repos/billpoulson/AnimeDB/releases?per_page=100';

/** Match YYYY.MM.DD (optional .N) after prefix for date-version tags */
function parseDateVersion(tag, prefix = TRAY_RELEASE_TAG_PREFIX) {
  const suffix = tag.startsWith(prefix) ? tag.slice(prefix.length) : '';
  const match = suffix.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\.(\d+))?$/);
  if (!match) return null;
  return {
    y: parseInt(match[1], 10),
    m: parseInt(match[2], 10),
    d: parseInt(match[3], 10),
    n: match[4] ? parseInt(match[4], 10) : 0,
  };
}

function compareDateVersion(a, b, prefix = TRAY_RELEASE_TAG_PREFIX) {
  const va = parseDateVersion(a, prefix);
  const vb = parseDateVersion(b, prefix);
  if (!va || !vb) return 0;
  if (va.y !== vb.y) return va.y > vb.y ? 1 : -1;
  if (va.m !== vb.m) return va.m > vb.m ? 1 : -1;
  if (va.d !== vb.d) return va.d > vb.d ? 1 : -1;
  if (va.n !== vb.n) return va.n > vb.n ? 1 : -1;
  return 0;
}

function parseSemver(tag, prefix = TRAY_RELEASE_TAG_PREFIX) {
  const match = tag.replace(prefix, '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match ? [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)] : null;
}

function compareSemver(a, b, prefix = TRAY_RELEASE_TAG_PREFIX) {
  const va = parseSemver(a, prefix);
  const vb = parseSemver(b, prefix);
  if (!va || !vb) return 0;
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return va[i] > vb[i] ? 1 : -1;
  }
  return 0;
}

/**
 * Compare two tray tags for "latest". Date-version tags are newer than semver; same type compared by value.
 */
function compareTrayTags(a, b, prefix = TRAY_RELEASE_TAG_PREFIX) {
  const aDate = parseDateVersion(a, prefix);
  const bDate = parseDateVersion(b, prefix);
  const aSemver = parseSemver(a, prefix);
  const bSemver = parseSemver(b, prefix);
  if (aDate && bDate) return compareDateVersion(a, b, prefix);
  if (aSemver && bSemver) return compareSemver(a, b, prefix);
  if (aDate && bSemver) return 1;
  if (aSemver && bDate) return -1;
  return 0;
}

/**
 * Returns the tray context menu label for the update item (shared so tests can assert on it).
 * @param {string | null} updateStatus - 'checking' | 'available' | 'not-available' | 'downloaded' | 'error'
 * @param {string | null} updateVersion - Version string when status is 'available'
 */
function getUpdateMenuLabel(updateStatus, updateVersion) {
  if (updateStatus === 'checking') return 'Checking for updates...';
  if (updateStatus === 'available') return `Update available: ${updateVersion}`;
  if (updateStatus === 'downloaded') return 'Restart to install update';
  if (updateStatus === 'error') return 'Update check failed';
  if (updateStatus === 'not-available') return 'No updates available';
  return 'Check for updates';
}

/**
 * Returns true if latestTag is a newer release than currentVersion (so an update is available).
 * @param {string} currentVersion - App version string (e.g. "2026.03.08" or "1.0.6")
 * @param {string} latestTag - Full tag (e.g. "upnp-tray-v2026.03.08")
 * @param {string} [prefix]
 */
function isNewerReleaseAvailable(currentVersion, latestTag, prefix = TRAY_RELEASE_TAG_PREFIX) {
  if (!currentVersion || !latestTag || !latestTag.startsWith(prefix)) return false;
  const currentTag = prefix + currentVersion;
  return compareTrayTags(currentTag, latestTag, prefix) < 0;
}

/**
 * Given a GitHub API releases array, return the latest tray tag or an error.
 * @param {Array<{ tag_name?: string }>} releases
 * @param {string} prefix
 * @returns {{ tag: string } | { error: 'none' | 'server' }}
 */
function getLatestTrayTagFromReleases(releases, prefix = TRAY_RELEASE_TAG_PREFIX) {
  if (!Array.isArray(releases)) {
    return { error: 'server' };
  }
  const trayTags = releases
    .filter((r) => r.tag_name && r.tag_name.startsWith(prefix))
    .map((r) => r.tag_name);
  if (trayTags.length === 0) {
    return { error: 'none' };
  }
  trayTags.sort((a, b) => -compareTrayTags(a, b, prefix));
  return { tag: trayTags[0] };
}

/**
 * Fetch releases from GitHub and return latest tray tag or error.
 * @param {typeof fetch} fetchImpl
 * @param {{ retries?: number, retryDelayMs?: number, timeoutMs?: number, log?: (msg: string) => void }} opts
 * @returns {Promise<{ tag: string } | { error: 'none' | 'network' | 'rate_limit' | 'server', detail?: string }}>}
 */
async function getLatestTrayReleaseTag(
  fetchImpl = typeof fetch !== 'undefined' ? fetch : null,
  opts = {},
) {
  const retries = opts.retries ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 15000;
  const prefix = opts.prefix ?? TRAY_RELEASE_TAG_PREFIX;
  const log = opts.log;

  if (!fetchImpl) {
    log?.('Update check: no fetch implementation (not packaged?)');
    return { error: 'network', detail: 'no fetch' };
  }

  const headers = { Accept: 'application/vnd.github.v3+json' };
  let lastNetworkError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log?.(`Update check: attempt ${attempt}/${retries}`);
      const res = await fetchImpl(GITHUB_RELEASES_API, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 403) {
        log?.('Update check: HTTP 403 (GitHub rate limit or token required)');
        return { error: 'rate_limit', detail: 'HTTP 403' };
      }
      if (!res.ok) {
        const detail = `${res.status} ${res.statusText || ''}`.trim();
        log?.(`Update check: HTTP ${detail}`);
        return { error: 'server', detail };
      }
      const releases = await res.json();
      const result = getLatestTrayTagFromReleases(releases, prefix);
      if (result.error === 'none') {
        log?.('Update check: no tray releases in API response');
      }
      return result;
    } catch (err) {
      lastNetworkError = err;
      const msg = err && (err.message || err.name || String(err));
      log?.(`Update check: network error (attempt ${attempt}/${retries}): ${msg || 'unknown'}`);
      if (attempt === retries) {
        return { error: 'network', detail: msg || 'unknown' };
      }
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }
}

module.exports = {
  TRAY_RELEASE_TAG_PREFIX,
  GITHUB_RELEASES_API,
  parseDateVersion,
  compareDateVersion,
  parseSemver,
  compareSemver,
  compareTrayTags,
  getUpdateMenuLabel,
  isNewerReleaseAvailable,
  getLatestTrayTagFromReleases,
  getLatestTrayReleaseTag,
};
