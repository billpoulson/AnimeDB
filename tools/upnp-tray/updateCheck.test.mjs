import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  TRAY_RELEASE_TAG_PREFIX,
  parseSemver,
  compareSemver,
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
  it('returns latest tray tag when multiple tray releases exist', () => {
    const releases = [
      { tag_name: 'v2026.03.04' },
      { tag_name: 'upnp-tray-v1.0.3' },
      { tag_name: 'upnp-tray-v1.0.5' },
      { tag_name: 'upnp-tray-v1.0.4' },
    ];
    expect(getLatestTrayTagFromReleases(releases)).toEqual({ tag: 'upnp-tray-v1.0.5' });
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
    expect(result).toEqual({ error: 'rate_limit' });
  });

  it('returns error server when response is 500', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const result = await getLatestTrayReleaseTag(mockFetch, { retries: 1 });
    expect(result).toEqual({ error: 'server' });
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
    expect(result).toEqual({ error: 'network' });
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
    expect(result).toEqual({ error: 'network' });
  });
});
