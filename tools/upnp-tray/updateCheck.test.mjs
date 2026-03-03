import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  TRAY_RELEASE_TAG_PREFIX,
  parseDateVersion,
  compareDateVersion,
  parseSemver,
  compareSemver,
  compareTrayTags,
  getUpdateMenuLabel,
  isNewerReleaseAvailable,
  getLatestTrayTagFromReleases,
  getLatestTrayReleaseTag,
} = require('./updateCheck.js');

describe('parseSemver', () => {
  it('parses valid tray tag and returns [major, minor, patch]', () => {
    expect(parseSemver('upnp-tray-v1.0.0')).toEqual([1, 0, 0]);
    expect(parseSemver('upnp-tray-v1.0.5')).toEqual([1, 0, 5]);
    expect(parseSemver('upnp-tray-v2.10.99')).toEqual([2, 10, 99]);
  });

  it('returns null for invalid or non-tray tag', () => {
    expect(parseSemver('v1.0.0')).toBeNull();
    expect(parseSemver('upnp-tray-v1.0')).toBeNull();
    expect(parseSemver('upnp-tray-v1.0.0-beta')).toBeNull();
    expect(parseSemver('')).toBeNull();
  });

  it('accepts custom prefix', () => {
    expect(parseSemver('prefix-v9.8.7', 'prefix-v')).toEqual([9, 8, 7]);
  });
});

describe('parseDateVersion', () => {
  it('parses date-version tag and returns { y, m, d, n }', () => {
    expect(parseDateVersion('upnp-tray-v2026.03.05')).toEqual({ y: 2026, m: 3, d: 5, n: 0 });
    expect(parseDateVersion('upnp-tray-v2026.12.31')).toEqual({ y: 2026, m: 12, d: 31, n: 0 });
  });

  it('parses date with same-day sequence', () => {
    expect(parseDateVersion('upnp-tray-v2026.03.05.2')).toEqual({ y: 2026, m: 3, d: 5, n: 2 });
  });

  it('returns null for semver or invalid tag', () => {
    expect(parseDateVersion('upnp-tray-v1.0.7')).toBeNull();
    expect(parseDateVersion('v2026.03.05')).toBeNull();
    expect(parseDateVersion('upnp-tray-v2026.3.5')).toEqual({ y: 2026, m: 3, d: 5, n: 0 });
  });

  it('accepts custom prefix', () => {
    expect(parseDateVersion('pre-v2026.03.05', 'pre-v')).toEqual({ y: 2026, m: 3, d: 5, n: 0 });
  });
});

describe('compareDateVersion', () => {
  it('returns 1 when a > b', () => {
    expect(compareDateVersion('upnp-tray-v2026.03.06', 'upnp-tray-v2026.03.05')).toBe(1);
    expect(compareDateVersion('upnp-tray-v2026.04.01', 'upnp-tray-v2026.03.31')).toBe(1);
  });

  it('returns -1 when a < b', () => {
    expect(compareDateVersion('upnp-tray-v2026.03.05', 'upnp-tray-v2026.03.06')).toBe(-1);
  });

  it('returns 0 when a === b', () => {
    expect(compareDateVersion('upnp-tray-v2026.03.05', 'upnp-tray-v2026.03.05')).toBe(0);
  });
});

describe('getUpdateMenuLabel', () => {
  it('returns correct label for each status', () => {
    expect(getUpdateMenuLabel('checking', null)).toBe('Checking for updates...');
    expect(getUpdateMenuLabel('available', '2026.03.08')).toBe('Update available: 2026.03.08');
    expect(getUpdateMenuLabel('downloaded', null)).toBe('Restart to install update');
    expect(getUpdateMenuLabel('error', null)).toBe('Update check failed');
    expect(getUpdateMenuLabel('not-available', null)).toBe('No updates available');
    expect(getUpdateMenuLabel(null, null)).toBe('Check for updates');
    expect(getUpdateMenuLabel('', null)).toBe('Check for updates');
  });
});

describe('isNewerReleaseAvailable', () => {
  it('returns false when current equals latest (date version)', () => {
    expect(isNewerReleaseAvailable('2026.03.08', 'upnp-tray-v2026.03.08')).toBe(false);
    expect(isNewerReleaseAvailable('2026.3.8', 'upnp-tray-v2026.03.08')).toBe(false);
  });

  it('returns true when latest is newer than current (date version)', () => {
    expect(isNewerReleaseAvailable('2026.03.07', 'upnp-tray-v2026.03.08')).toBe(true);
    expect(isNewerReleaseAvailable('2026.03.08', 'upnp-tray-v2026.03.09')).toBe(true);
  });

  it('returns false when current is newer than latest (date version)', () => {
    expect(isNewerReleaseAvailable('2026.03.08', 'upnp-tray-v2026.03.07')).toBe(false);
  });

  it('returns false when current equals latest (semver)', () => {
    expect(isNewerReleaseAvailable('1.0.6', 'upnp-tray-v1.0.6')).toBe(false);
  });

  it('returns true when latest is newer than current (semver)', () => {
    expect(isNewerReleaseAvailable('1.0.5', 'upnp-tray-v1.0.6')).toBe(true);
  });

  it('returns false when latestTag does not match prefix', () => {
    expect(isNewerReleaseAvailable('2026.03.07', 'v2026.03.08')).toBe(false);
  });

  it('returns false when currentVersion is empty', () => {
    expect(isNewerReleaseAvailable('', 'upnp-tray-v2026.03.08')).toBe(false);
  });

  it('returns false when latestTag is empty or null', () => {
    expect(isNewerReleaseAvailable('2026.03.07', '')).toBe(false);
  });

  it('accepts custom prefix', () => {
    expect(isNewerReleaseAvailable('2.0.0', 'myapp-v2.0.1', 'myapp-v')).toBe(true);
    expect(isNewerReleaseAvailable('2.0.0', 'myapp-v2.0.0', 'myapp-v')).toBe(false);
  });
});

describe('compareTrayTags', () => {
  it('prefers date tag over semver (date is newer)', () => {
    expect(compareTrayTags('upnp-tray-v2026.03.05', 'upnp-tray-v1.0.7')).toBe(1);
    expect(compareTrayTags('upnp-tray-v1.0.7', 'upnp-tray-v2026.03.05')).toBe(-1);
  });

  it('sorts date tags by date', () => {
    expect(compareTrayTags('upnp-tray-v2026.03.06', 'upnp-tray-v2026.03.05')).toBe(1);
  });

  it('sorts semver tags by semver', () => {
    expect(compareTrayTags('upnp-tray-v1.0.7', 'upnp-tray-v1.0.6')).toBe(1);
  });
});

describe('compareSemver', () => {
  it('returns 1 when a > b', () => {
    expect(compareSemver('upnp-tray-v1.0.1', 'upnp-tray-v1.0.0')).toBe(1);
    expect(compareSemver('upnp-tray-v2.0.0', 'upnp-tray-v1.9.9')).toBe(1);
    expect(compareSemver('upnp-tray-v1.1.0', 'upnp-tray-v1.0.9')).toBe(1);
  });

  it('returns -1 when a < b', () => {
    expect(compareSemver('upnp-tray-v1.0.0', 'upnp-tray-v1.0.1')).toBe(-1);
    expect(compareSemver('upnp-tray-v1.9.9', 'upnp-tray-v2.0.0')).toBe(-1);
  });

  it('returns 0 when a === b', () => {
    expect(compareSemver('upnp-tray-v1.0.0', 'upnp-tray-v1.0.0')).toBe(0);
  });

  it('returns 0 when either tag is invalid', () => {
    expect(compareSemver('upnp-tray-v1.0.0', 'v1.0.0')).toBe(0);
    expect(compareSemver('bad', 'upnp-tray-v1.0.0')).toBe(0);
  });
});

describe('getLatestTrayTagFromReleases', () => {
  it('returns latest tray tag when multiple semver releases exist', () => {
    const releases = [
      { tag_name: 'v2026.03.04' },
      { tag_name: 'upnp-tray-v1.0.3' },
      { tag_name: 'upnp-tray-v1.0.5' },
      { tag_name: 'upnp-tray-v1.0.4' },
    ];
    expect(getLatestTrayTagFromReleases(releases)).toEqual({ tag: 'upnp-tray-v1.0.5' });
  });

  it('prefers date-version tag over semver (date is latest)', () => {
    const releases = [
      { tag_name: 'upnp-tray-v1.0.7' },
      { tag_name: 'upnp-tray-v2026.03.05' },
      { tag_name: 'upnp-tray-v1.0.6' },
    ];
    expect(getLatestTrayTagFromReleases(releases)).toEqual({ tag: 'upnp-tray-v2026.03.05' });
  });

  it('returns latest when multiple date-version tags exist', () => {
    const releases = [
      { tag_name: 'upnp-tray-v2026.03.04' },
      { tag_name: 'upnp-tray-v2026.03.06' },
      { tag_name: 'upnp-tray-v2026.03.05' },
    ];
    expect(getLatestTrayTagFromReleases(releases)).toEqual({ tag: 'upnp-tray-v2026.03.06' });
  });

  it('returns single tray tag when only one exists', () => {
    const releases = [
      { tag_name: 'v2026.03.04' },
      { tag_name: 'upnp-tray-v1.0.5' },
    ];
    expect(getLatestTrayTagFromReleases(releases)).toEqual({ tag: 'upnp-tray-v1.0.5' });
  });

  it('returns error none when no tray tags in releases', () => {
    const releases = [{ tag_name: 'v2026.03.04' }, { tag_name: 'v2026.03.03' }];
    expect(getLatestTrayTagFromReleases(releases)).toEqual({ error: 'none' });
  });

  it('returns error none when releases is empty', () => {
    expect(getLatestTrayTagFromReleases([])).toEqual({ error: 'none' });
  });

  it('returns error server when releases is not an array', () => {
    expect(getLatestTrayTagFromReleases(null)).toEqual({ error: 'server' });
    expect(getLatestTrayTagFromReleases({})).toEqual({ error: 'server' });
  });

  it('ignores releases without tag_name', () => {
    const releases = [{ tag_name: 'upnp-tray-v1.0.5' }, {}];
    expect(getLatestTrayTagFromReleases(releases)).toEqual({ tag: 'upnp-tray-v1.0.5' });
  });

  it('accepts custom prefix', () => {
    const releases = [{ tag_name: 'myapp-v2.0.0' }, { tag_name: 'myapp-v1.0.0' }];
    expect(getLatestTrayTagFromReleases(releases, 'myapp-v')).toEqual({ tag: 'myapp-v2.0.0' });
  });
});

describe('getLatestTrayReleaseTag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns tag when fetch returns 200 with tray releases', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { tag_name: 'v2026.03.04' },
          { tag_name: 'upnp-tray-v1.0.5' },
        ]),
    });
    const p = getLatestTrayReleaseTag(mockFetch, { retries: 1, timeoutMs: 5000 });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result).toEqual({ tag: 'upnp-tray-v1.0.5' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns error rate_limit when response is 403', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    const result = await getLatestTrayReleaseTag(mockFetch, { retries: 1 });
    expect(result).toMatchObject({ error: 'rate_limit' });
  });

  it('returns error server when response is 500', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const result = await getLatestTrayReleaseTag(mockFetch, { retries: 1 });
    expect(result).toMatchObject({ error: 'server' });
  });

  it('returns error none when response is 200 but no tray tags', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ tag_name: 'v2026.03.04' }]),
    });
    const result = await getLatestTrayReleaseTag(mockFetch, { retries: 1 });
    expect(result).toEqual({ error: 'none' });
  });

  it('returns error network when fetch throws', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network'));
    const p = getLatestTrayReleaseTag(mockFetch, { retries: 2, retryDelayMs: 10 });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result).toMatchObject({ error: 'network' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on throw and succeeds on second attempt', async () => {
    const releases = [{ tag_name: 'upnp-tray-v1.0.5' }];
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(releases),
      });
    const p = getLatestTrayReleaseTag(mockFetch, { retries: 3, retryDelayMs: 10 });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result).toEqual({ tag: 'upnp-tray-v1.0.5' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns error network when fetchImpl is null', async () => {
    const result = await getLatestTrayReleaseTag(null, { retries: 1 });
    expect(result).toMatchObject({ error: 'network' });
  });
});

describe('getLatestTrayReleaseTag (log output)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('calls log with attempt and no failure message on success', async () => {
    const log = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ tag_name: 'upnp-tray-v1.0.5' }]),
    });
    const result = await getLatestTrayReleaseTag(mockFetch, { retries: 1, log });
    expect(result).toEqual({ tag: 'upnp-tray-v1.0.5' });
    expect(log).toHaveBeenCalledWith('Update check: attempt 1/1');
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('calls log with attempt and HTTP 403 message on rate limit', async () => {
    const log = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await getLatestTrayReleaseTag(mockFetch, { retries: 1, log });
    expect(log).toHaveBeenCalledWith('Update check: attempt 1/1');
    expect(log).toHaveBeenCalledWith('Update check: HTTP 403 (GitHub rate limit or token required)');
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('calls log with attempt and HTTP status on server error', async () => {
    const log = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });
    await getLatestTrayReleaseTag(mockFetch, { retries: 1, log });
    expect(log).toHaveBeenCalledWith('Update check: attempt 1/1');
    expect(log).toHaveBeenCalledWith('Update check: HTTP 500 Internal Server Error');
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('calls log with attempt and no-tray-releases message when API has no tray tags', async () => {
    const log = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ tag_name: 'v2026.03.04' }]),
    });
    await getLatestTrayReleaseTag(mockFetch, { retries: 1, log });
    expect(log).toHaveBeenCalledWith('Update check: attempt 1/1');
    expect(log).toHaveBeenCalledWith('Update check: no tray releases in API response');
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('calls log with network error message when fetch throws', async () => {
    const log = vi.fn();
    const mockFetch = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const p = getLatestTrayReleaseTag(mockFetch, { retries: 2, retryDelayMs: 10, log });
    await vi.runAllTimersAsync();
    await p;
    expect(log).toHaveBeenCalledWith('Update check: attempt 1/2');
    expect(log).toHaveBeenCalledWith('Update check: network error (attempt 1/2): fetch failed');
    expect(log).toHaveBeenCalledWith('Update check: attempt 2/2');
    expect(log).toHaveBeenCalledWith('Update check: network error (attempt 2/2): fetch failed');
    expect(log).toHaveBeenCalledTimes(4);
  });

  it('calls log with no-fetch message when fetchImpl is null', async () => {
    const log = vi.fn();
    await getLatestTrayReleaseTag(null, { retries: 1, log });
    expect(log).toHaveBeenCalledWith('Update check: no fetch implementation (not packaged?)');
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('does not call log when opts.log is omitted', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ tag_name: 'upnp-tray-v1.0.5' }]),
    });
    const result = await getLatestTrayReleaseTag(mockFetch, { retries: 1 });
    expect(result).toEqual({ tag: 'upnp-tray-v1.0.5' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('getLatestTrayReleaseTag (integration with GitHub)', () => {
  it.skipIf(!process.env.RUN_GITHUB_INTEGRATION)(
    'fetches latest tray tag from upstream GitHub API',
    async () => {
      const result = await getLatestTrayReleaseTag(globalThis.fetch, {
        retries: 2,
        timeoutMs: 15000,
      });
      expect(result).toBeDefined();
      if (result.error) {
        expect(['network', 'rate_limit', 'server', 'none']).toContain(result.error);
        return;
      }
      expect(result).toHaveProperty('tag');
      expect(result.tag).toMatch(new RegExp(`^${TRAY_RELEASE_TAG_PREFIX}`));
      expect(parseDateVersion(result.tag) || parseSemver(result.tag)).toBeTruthy();
    },
    20000,
  );

  it.skipIf(!process.env.RUN_GITHUB_INTEGRATION)(
    'menu label matches update check result (current = latest → No updates; current < latest → Update available)',
    async () => {
      const result = await getLatestTrayReleaseTag(globalThis.fetch, {
        retries: 2,
        timeoutMs: 15000,
      });
      expect(result).toBeDefined();
      if (result.error) {
        expect(['network', 'rate_limit', 'server', 'none']).toContain(result.error);
        return;
      }
      expect(result).toHaveProperty('tag');
      const latestTag = result.tag;
      const latestVersion = latestTag.startsWith(TRAY_RELEASE_TAG_PREFIX)
        ? latestTag.slice(TRAY_RELEASE_TAG_PREFIX.length)
        : latestTag;

      // When current version equals latest: menu shows "No updates available"
      const hasNewerWhenCurrent = isNewerReleaseAvailable(latestVersion, latestTag);
      expect(hasNewerWhenCurrent).toBe(false);
      const statusWhenCurrent = 'not-available';
      const labelWhenCurrent = getUpdateMenuLabel(statusWhenCurrent, null);
      expect(labelWhenCurrent).toBe('No updates available');

      // When current version is older: menu shows "Update available: <version>"
      const oldVersion = parseDateVersion(latestTag)
        ? '2026.01.01'
        : '1.0.0';
      const hasNewerWhenOld = isNewerReleaseAvailable(oldVersion, latestTag);
      expect(hasNewerWhenOld).toBe(true);
      const statusWhenOld = 'available';
      const labelWhenOld = getUpdateMenuLabel(statusWhenOld, latestVersion);
      expect(labelWhenOld).toBe(`Update available: ${latestVersion}`);
    },
    20000,
  );
});
