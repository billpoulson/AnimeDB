/**
 * Update detection for UPnP tray. Fetches GitHub releases, filters by tray tag prefix, returns latest.
 * No Electron dependency so it can be unit tested in Node.
 */

const TRAY_RELEASE_TAG_PREFIX = 'upnp-tray-v';
const GITHUB_RELEASES_API = 'https://api.github.com/repos/billpoulson/AnimeDB/releases?per_page=100';

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
  trayTags.sort((a, b) => -compareSemver(a, b, prefix));
  return { tag: trayTags[0] };
}

/**
 * Fetch releases from GitHub and return latest tray tag or error.
 * @param {typeof fetch} fetchImpl
 * @param {{ retries?: number, retryDelayMs?: number, timeoutMs?: number }} opts
 * @returns {Promise<{ tag: string } | { error: 'none' | 'network' | 'rate_limit' | 'server' }}>}
 */
async function getLatestTrayReleaseTag(
  fetchImpl = typeof fetch !== 'undefined' ? fetch : null,
  opts = {},
) {
  const retries = opts.retries ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 15000;
  const prefix = opts.prefix ?? TRAY_RELEASE_TAG_PREFIX;

  if (!fetchImpl) {
    return { error: 'network' };
  }

  const headers = { Accept: 'application/vnd.github.v3+json' };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(GITHUB_RELEASES_API, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 403) {
        return { error: 'rate_limit' };
      }
      if (!res.ok) {
        return { error: 'server' };
      }
      const releases = await res.json();
      const result = getLatestTrayTagFromReleases(releases, prefix);
      return result;
    } catch {
      if (attempt === retries) {
        return { error: 'network' };
      }
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }
  return { error: 'network' };
}

module.exports = {
  TRAY_RELEASE_TAG_PREFIX,
  GITHUB_RELEASES_API,
  parseSemver,
  compareSemver,
  getLatestTrayTagFromReleases,
  getLatestTrayReleaseTag,
};
