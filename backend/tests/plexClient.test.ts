import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { triggerPlexScan, testPlexConnection } from '../src/services/plexClient';

vi.mock('axios');

vi.mock('../src/config', () => ({
  config: {
    authDisabled: true,
    plex: {
      url: 'http://plex:32400',
      token: 'test-token',
      sectionMovies: 1,
      sectionTv: 2,
    },
  },
}));

describe('triggerPlexScan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Plex API for movies section', async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200 });
    await triggerPlexScan('movies');

    expect(axios.get).toHaveBeenCalledWith(
      'http://plex:32400/library/sections/1/refresh',
      expect.objectContaining({
        headers: { 'X-Plex-Token': 'test-token' },
      })
    );
  });

  it('calls Plex API for TV section', async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200 });
    await triggerPlexScan('tv');

    expect(axios.get).toHaveBeenCalledWith(
      'http://plex:32400/library/sections/2/refresh',
      expect.objectContaining({
        headers: { 'X-Plex-Token': 'test-token' },
      })
    );
  });

  it('skips scan for other category', async () => {
    await triggerPlexScan('other');
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('uses per-library plex section ID when provided', async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200 });
    await triggerPlexScan('other', 42);

    expect(axios.get).toHaveBeenCalledWith(
      'http://plex:32400/library/sections/42/refresh',
      expect.objectContaining({
        headers: { 'X-Plex-Token': 'test-token' },
      })
    );
  });
});

describe('testPlexConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when Plex responds', async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200 });
    expect(await testPlexConnection()).toBe(true);
  });

  it('returns false on network error', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await testPlexConnection()).toBe(false);
  });
});
